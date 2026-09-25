# Emerald Forge 3D — enquête dynamique

Application web Express + SQLite pour une enquête de marché sur des objets 3D fantasy / sci-fi / geek.

## Fonctionnalités
- Page publique responsive
- Fiches produits chargées depuis SQLite
- Réponses prix / usage / intérêt enregistrées en base
- Administration privée accessible par le petit diamant en bas à droite
- Mot de passe initial : `panda2112`
- Création, modification, suppression, visibilité et ordre des fiches
- Upload d'images
- Statistiques de réponses par fiche

## Lancer
```bash
npm install
npm start
```
Puis ouvrir `http://localhost:3000`.

## Mise en ligne
Définir au minimum `ADMIN_PASSWORD` et `SESSION_SECRET` dans l'environnement du serveur. Utiliser HTTPS et un stockage persistant pour le dossier `data/` et `public/uploads/`.
