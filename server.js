import express from 'express';
import session from 'express-session';
import multer from 'multer';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'panda2112';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const db = new Database(path.join(__dirname, 'data', 'emerald.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 description TEXT DEFAULT '',
 category TEXT DEFAULT 'Fantasy',
 image TEXT DEFAULT '',
 width REAL, height REAL, depth REAL,
 weight REAL, print_hours REAL,
 material TEXT DEFAULT 'PLA',
 price1 REAL, price2 REAL, price3 REAL, price4 REAL,
 active INTEGER DEFAULT 1,
 sort_order INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS responses (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 product_id INTEGER NOT NULL,
 price_choice REAL,
 uses TEXT DEFAULT '',
 interest INTEGER,
 other TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(product_id) REFERENCES products(id)
);
`);

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'public', 'uploads'),
    filename: (_, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 8 * 1024 * 1024 }
});

app.use(express.json({limit:'1mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({ secret: SESSION_SECRET, resave:false, saveUninitialized:false, cookie:{httpOnly:true,sameSite:'lax',secure:false,maxAge:8*60*60*1000} }));
app.use(express.static(path.join(__dirname,'public')));

function admin(req,res,next){ if(req.session.admin) return next(); return res.status(401).json({error:'Non autorisé'}); }

app.get('/api/products', (req,res)=>{
  const rows=db.prepare('SELECT * FROM products WHERE active=1 ORDER BY sort_order,id').all();
  res.json(rows);
});
app.get('/api/admin/products', admin, (req,res)=>res.json(db.prepare('SELECT * FROM products ORDER BY sort_order,id').all()));
app.post('/api/responses', (req,res)=>{
  const {product_id, price_choice, uses, interest, other} = req.body;
  const product=db.prepare('SELECT id FROM products WHERE id=? AND active=1').get(product_id);
  if(!product) return res.status(400).json({error:'Objet invalide'});
  db.prepare('INSERT INTO responses(product_id,price_choice,uses,interest,other) VALUES(?,?,?,?,?)').run(product_id, price_choice === '' ? null : (price_choice ?? null), Array.isArray(uses)?uses.join(', '):(uses||''), interest === '' ? null : (interest ?? null), String(other||'').slice(0,1000));
  res.json({ok:true});
});

app.post('/api/login', (req,res)=>{
  if(req.body.password === ADMIN_PASSWORD){ req.session.admin=true; return res.json({ok:true}); }
  res.status(401).json({error:'Mot de passe incorrect'});
});
app.post('/api/logout', admin, (req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me', (req,res)=>res.json({admin:!!req.session.admin}));

app.post('/api/admin/products', admin, upload.single('image'), (req,res)=>{
  const b=req.body;
  const image=req.file ? `/uploads/${req.file.filename}` : (b.image||'');
  const info=db.prepare(`INSERT INTO products(name,description,category,image,width,height,depth,weight,print_hours,material,price1,price2,price3,price4,active,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.name,b.description||'',b.category||'Fantasy',image,Number(b.width)||null,Number(b.height)||null,Number(b.depth)||null,Number(b.weight)||null,Number(b.print_hours)||null,b.material||'PLA',Number(b.price1)||null,Number(b.price2)||null,Number(b.price3)||null,Number(b.price4)||null,b.active==='0'?0:1,Number(b.sort_order)||0);
  res.json({id:info.lastInsertRowid});
});
app.put('/api/admin/products/:id', admin, upload.single('image'), (req,res)=>{
  const b=req.body; const old=db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id); if(!old)return res.status(404).json({error:'Objet introuvable'});
  const image=req.file ? `/uploads/${req.file.filename}` : (b.image ?? old.image);
  db.prepare(`UPDATE products SET name=?,description=?,category=?,image=?,width=?,height=?,depth=?,weight=?,print_hours=?,material=?,price1=?,price2=?,price3=?,price4=?,active=?,sort_order=? WHERE id=?`).run(
    b.name,b.description||'',b.category||'Fantasy',image,Number(b.width)||null,Number(b.height)||null,Number(b.depth)||null,Number(b.weight)||null,Number(b.print_hours)||null,b.material||'PLA',Number(b.price1)||null,Number(b.price2)||null,Number(b.price3)||null,Number(b.price4)||null,b.active==='0'?0:1,Number(b.sort_order)||0,req.params.id);
  res.json({ok:true});
});
app.delete('/api/admin/products/:id', admin, (req,res)=>{ db.prepare('DELETE FROM products WHERE id=?').run(req.params.id); res.json({ok:true}); });
app.get('/api/admin/stats', admin, (req,res)=>{
  const products=db.prepare('SELECT id,name FROM products ORDER BY sort_order,id').all();
  const stats=products.map(p=>({product:p,responses:db.prepare('SELECT COUNT(*) c FROM responses WHERE product_id=?').get(p.id).c,prices:db.prepare('SELECT price_choice,COUNT(*) c FROM responses WHERE product_id=? GROUP BY price_choice ORDER BY price_choice').all(p.id),uses:db.prepare('SELECT uses,COUNT(*) c FROM responses WHERE product_id=? GROUP BY uses ORDER BY c DESC').all(p.id)}));
  res.json(stats);
});

app.use((req,res,next)=>{ if(req.method==='GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(__dirname,'public','index.html')); next(); });
app.use((err,req,res,next)=>{ console.error(err); if(!res.headersSent) res.status(500).json({error:'Erreur serveur'}); });
app.listen(PORT,()=>console.log(`Emerald Forge 3D running on http://localhost:${PORT}`));
