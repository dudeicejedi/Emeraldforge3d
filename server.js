import express from 'express';
import session from 'express-session';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (
  !ADMIN_PASSWORD ||
  !SESSION_SECRET ||
  !SUPABASE_URL ||
  !SUPABASE_SERVICE_ROLE_KEY
) {
  console.error('Variables d’environnement manquantes.');
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// =========================================
// EXPRESS
// =========================================

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, 'public')));

// =========================================
// UPLOAD IMAGES
// =========================================

const MAX_IMAGES = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024
  }
});

// =========================================
// HELPERS
// =========================================

function admin(req, res, next) {
  if (req.session.admin) {
    return next();
  }

  return res.status(401).json({
    error: 'Non autorisé'
  });
}

function numOrNull(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function parseImagesField(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x) : [];
  } catch {
    return [];
  }
}

async function uploadImage(file) {
  if (!file) {
    return '';
  }

  const extension =
    path.extname(file.originalname).toLowerCase() || '.jpg';

  const filename =
    `${Date.now()}-` +
    `${crypto.randomBytes(5).toString('hex')}` +
    extension;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(filename, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from('product-images')
    .getPublicUrl(filename);

  return data.publicUrl;
}

async function uploadImages(files) {
  if (!files || !files.length) {
    return [];
  }

  const urls = [];

  for (const file of files) {
    urls.push(await uploadImage(file));
  }

  return urls;
}

// =========================================
// PUBLIC API
// =========================================

app.get('/api/products', async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('active', 1)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Impossible de charger les objets'
    });
  }

  res.json(data || []);
});

app.post('/api/responses', async (req, res) => {
  try {
    const {
      product_id,
      price_choice,
      uses,
      interest,
      other
    } = req.body;

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id')
      .eq('id', product_id)
      .eq('active', 1)
      .maybeSingle();

    if (productError) {
      console.error(productError);
      return res.status(500).json({
        error: 'Erreur serveur'
      });
    }

    if (!product) {
      return res.status(400).json({
        error: 'Objet invalide'
      });
    }

    const usesValue = Array.isArray(uses)
      ? uses.join(', ')
      : String(uses || '');

    const { error } = await supabase
      .from('responses')
      .insert({
        product_id: product_id,
        price_choice:
          price_choice === '' || price_choice == null
            ? null
            : numOrNull(price_choice),
        uses: usesValue,
        interest:
          interest === '' || interest == null
            ? null
            : numOrNull(interest),
        other: String(other || '').slice(0, 1000)
      });

    if (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Impossible d’enregistrer la réponse'
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// =========================================
// ADMIN LOGIN
// =========================================

app.post('/api/login', (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    req.session.admin = true;

    return res.json({
      ok: true
    });
  }

  res.status(401).json({
    error: 'Mot de passe incorrect'
  });
});

app.post('/api/logout', admin, (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

app.get('/api/me', (req, res) => {
  res.json({
    admin: !!req.session.admin
  });
});

// =========================================
// ADMIN - PRODUCTS
// =========================================

app.get('/api/admin/products', admin, async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({
      error: 'Impossible de charger les objets'
    });
  }

  res.json(data || []);
});

app.post(
  '/api/admin/products',
  admin,
  upload.array('images', MAX_IMAGES),
  async (req, res) => {
    try {
      const b = req.body;

      const newImages = await uploadImages(req.files);
      const images = newImages.slice(0, MAX_IMAGES);

      const product = {
        name: b.name,
        description: b.description || '',
        category: b.category || 'Fantasy',
        image: images[0] || '',
        images,
        width: numOrNull(b.width),
        height: numOrNull(b.height),
        depth: numOrNull(b.depth),
        weight: numOrNull(b.weight),
        print_hours: numOrNull(b.print_hours),
        material: b.material || 'PLA',
        price1: numOrNull(b.price1),
        price2: numOrNull(b.price2),
        active: b.active === '0' ? 0 : 1,
        sort_order: numOrNull(b.sort_order) ?? 0
      };

      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select('id')
        .single();

      if (error) {
        console.error('ERREUR SUPABASE INSERT PRODUCT:', error);

        return res.status(500).json({
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
      }

      res.json({
        id: data.id
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: 'Erreur serveur'
      });
    }
  }
);

app.put(
  '/api/admin/products/:id',
  admin,
  upload.array('images', MAX_IMAGES),
  async (req, res) => {
    try {
      const b = req.body;

      const { data: old, error: oldError } = await supabase
        .from('products')
        .select('*')
        .eq('id', req.params.id)
        .maybeSingle();

      if (oldError) {
        console.error(oldError);
        return res.status(500).json({
          error: 'Erreur serveur'
        });
      }

      if (!old) {
        return res.status(404).json({
          error: 'Objet introuvable'
        });
      }

      const keptImages = parseImagesField(b.existingImages);
      const newImages = await uploadImages(req.files);
      const images = [...keptImages, ...newImages].slice(0, MAX_IMAGES);

      const product = {
        name: b.name,
        description: b.description || '',
        category: b.category || 'Fantasy',
        image: images[0] || '',
        images,
        width: numOrNull(b.width),
        height: numOrNull(b.height),
        depth: numOrNull(b.depth),
        weight: numOrNull(b.weight),
        print_hours: numOrNull(b.print_hours),
        material: b.material || 'PLA',
        price1: numOrNull(b.price1),
        price2: numOrNull(b.price2),
        active: b.active === '0' ? 0 : 1,
        sort_order: numOrNull(b.sort_order) ?? 0
      };

      const { error } = await supabase
        .from('products')
        .update(product)
        .eq('id', req.params.id);

      if (error) {
        console.error(error);
        return res.status(500).json({
          error: 'Impossible de modifier l’objet'
        });
      }

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        error: 'Erreur serveur'
      });
    }
  }
);

app.delete(
  '/api/admin/products/:id',
  admin,
  async (req, res) => {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      console.error(error);
      return res.status(500).json({
        error: 'Impossible de supprimer l’objet'
      });
    }

    res.json({
      ok: true
    });
  }
);

// =========================================
// ADMIN - STATISTIQUES
// =========================================

app.get('/api/admin/stats', admin, async (req, res) => {
  try {
    const { data: products, error: productsError } =
      await supabase
        .from('products')
        .select('id,name')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

    if (productsError) {
      throw productsError;
    }

    const { data: responses, error: responsesError } =
      await supabase
        .from('responses')
        .select('product_id,price_choice,uses,interest,other');

    if (responsesError) {
      throw responsesError;
    }

    const stats = (products || []).map(product => {
      const rows = (responses || []).filter(
        response => response.product_id === product.id
      );

      const priceMap = {};
      const usesMap = {};
      const interestMap = {};
      const comments = [];
      let interestSum = 0;
      let interestCount = 0;

      for (const row of rows) {
        const price = row.price_choice;

        if (price !== null && price !== undefined) {
          const key = String(price);
          priceMap[key] = (priceMap[key] || 0) + 1;
        }

        const use = row.uses || '';

        if (use) {
          usesMap[use] = (usesMap[use] || 0) + 1;
        }

        const interest = row.interest;

        if (interest !== null && interest !== undefined) {
          const key = String(interest);
          interestMap[key] = (interestMap[key] || 0) + 1;
          interestSum += Number(interest);
          interestCount += 1;
        }

        const other = (row.other || '').trim();

        if (other) {
          comments.push(other);
        }
      }

      return {
        product,
        responses: rows.length,
        prices: Object.entries(priceMap).map(
          ([price_choice, count]) => ({
            price_choice: Number(price_choice),
            c: count
          })
        ),
        uses: Object.entries(usesMap)
          .map(([uses, count]) => ({
            uses,
            c: count
          }))
          .sort((a, b) => b.c - a.c),
        interest: {
          avg: interestCount
            ? Number((interestSum / interestCount).toFixed(2))
            : null,
          count: interestCount,
          distribution: Object.entries(interestMap)
            .map(([score, count]) => ({
              score: Number(score),
              c: count
            }))
            .sort((a, b) => a.score - b.score)
        },
        comments
      };
    });

    // Trie les fiches par intérêt moyen décroissant (les non évaluées en dernier)
    stats.sort((a, b) => {
      if (a.interest.avg === null && b.interest.avg === null) return 0;
      if (a.interest.avg === null) return 1;
      if (b.interest.avg === null) return -1;
      return b.interest.avg - a.interest.avg;
    });

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Impossible de charger les statistiques'
    });
  }
});

app.get('/api/admin/export.csv', admin, async (req, res) => {
  try {
    const { data: products, error: productsError } =
      await supabase.from('products').select('id,name');

    if (productsError) {
      throw productsError;
    }

    const nameById = Object.fromEntries(
      (products || []).map(p => [p.id, p.name])
    );

    const { data: responses, error: responsesError } =
      await supabase
        .from('responses')
        .select('*')
        .order('id', { ascending: true });

    if (responsesError) {
      throw responsesError;
    }

    const headers = [
      'id',
      'creation',
      'prix_propose',
      'utilisations',
      'interet',
      'autre_idee',
      'date'
    ];

    const csvEscape = value => {
      const s = String(value ?? '');
      return /[",;\n]/.test(s)
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };

    const rows = (responses || []).map(row => [
      row.id ?? '',
      nameById[row.product_id] || row.product_id,
      row.price_choice ?? '',
      row.uses ?? '',
      row.interest ?? '',
      row.other ?? '',
      row.created_at ?? ''
    ]);

    const csv = [headers.join(',')]
      .concat(rows.map(r => r.map(csvEscape).join(',')))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="emerald-forge-reponses.csv"'
    );
    // BOM pour un affichage correct des accents dans Excel
    res.send('\uFEFF' + csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Export impossible'
    });
  }
});

// =========================================
// PAGE PRINCIPALE
// =========================================

app.use((req, res, next) => {
  if (
    req.method === 'GET' &&
    !req.path.startsWith('/api/')
  ) {
    return res.sendFile(
      path.join(__dirname, 'public', 'index.html')
    );
  }

  next();
});

// =========================================
// ERREURS
// =========================================

app.use((err, req, res, next) => {
  console.error(err);

  if (!res.headersSent) {
    res.status(500).json({
      error: 'Erreur serveur'
    });
  }
});

// =========================================
// DÉMARRAGE
// =========================================

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `Emerald Forge 3D running on port ${PORT}`
    );
  }
);
