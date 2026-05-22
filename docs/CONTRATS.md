# Contrats d'interface — Site hôte ↔ App Quadrant

Ce document décrit les **interfaces** entre le site hôte (`etablissement.exemple.fr`, PHP 5.6) et l'application quadrant (`quadrant.exemple.fr`, PHP 8.x). Il ne contient pas de code mais les contrats à respecter des deux côtés.

---

## 1. Transmission des tokens du site hôte vers l'iframe

### Direction

`Site hôte (PHP)` → `Navigateur` → `Iframe quadrant`

### Mécanisme

Formulaire HTML caché, méthode POST, ciblant l'iframe. Auto-soumission par JavaScript dès le chargement de la page.

### Données transmises

3 champs cachés dans le formulaire :

| Nom du champ | Source | Format |
|---|---|---|
| `tokenConnexion` | `connexions.tokenConnexion` de la session courante | UUID 36 caractères |
| `token` | `connexions.token` (identifiant utilisateur dans la session) | 35 caractères |
| `token_campagne_utilisateurs` | `dial_campagne_utilisateurs_connexions.token_campagne_utilisateurs` actif | 26 caractères |

### Cible

L'iframe pointe vers : `https://quadrant.exemple.fr/api/auth/init` (à confirmer selon le routage retenu)

### Sécurité

- Les tokens ne doivent **jamais** figurer dans l'URL (params GET interdits)
- Le HTTPS est obligatoire de bout en bout
- Le HTML généré ne doit pas exposer les tokens dans le DOM accessible au JavaScript de tiers (pas de `<input>` visible dans le formulaire)

---

## 2. Vérification de session — appel server-to-server

### Direction

`API quadrant (PHP 8)` → `Site hôte (PHP 5.6)`

### Endpoint côté site hôte

`POST https://etablissement.exemple.fr/api/internal/verify-session.php`

### Sécurité de l'endpoint

L'endpoint est protégé par **deux couches** :

1. **Allowlist IP** : seules les IP sortantes du serveur OVH de l'API quadrant sont autorisées. Toute autre IP reçoit un 403.
2. **Clé d'API partagée** : header `X-Api-Key` contenant un secret connu uniquement des deux serveurs. Stocké en variable d'environnement ou fichier de configuration hors versionnement.

L'endpoint n'a **pas** de header CORS et n'est jamais documenté publiquement.

### Format de la requête entrante

```http
POST /api/internal/verify-session.php HTTP/1.1
Host: etablissement.exemple.fr
Content-Type: application/json
X-Api-Key: <secret partagé>

{
  "tokenConnexion": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "token": "user_abc123",
  "token_campagne_utilisateurs": "camp_xyz789..."
}
```

### Vérifications à effectuer côté site hôte

L'endpoint doit :

1. **Vérifier l'IP** d'origine (allowlist)
2. **Vérifier le header X-Api-Key**
3. **Vérifier que la session est valide** :
   - `connexions.tokenConnexion` existe pour le `tokenConnexion` reçu
   - `connexions.token` correspond au `token` reçu
   - `connexions.Etat = 'I'` (session active)
   - `connexions.expirationForm > NOW()` (session non expirée)
   - `dial_campagne_utilisateurs_connexions.token_campagne_utilisateurs` existe pour le token reçu et est lié au même `tokenConnexion`
   - `dial_campagne_utilisateurs_connexions.fin` n'est pas dans le passé
4. **Récupérer le contexte_id** via jointure avec les tables qui le contiennent (selon votre modèle interne)
5. **Prolonger `expirationForm`** : chaque appel quadrant compte comme une action utilisateur

### Format de réponse — succès

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "valid": true,
  "contexte_id": "a3Bf2"
}
```

Le `contexte_id` est une chaîne de **5 caractères alphanumériques en casse mixte** (a-z + A-Z + 0-9).

### Format de réponse — échec

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "valid": false
}
```

Note : on renvoie 200 même en cas de session invalide, pour éviter de signaler la cause précise à un attaquant. Réservez les codes 4xx pour les erreurs structurelles (IP non autorisée, header manquant).

### Codes HTTP

| Code | Signification |
|---|---|
| 200 | Réponse normale (succès ou échec de validation). Voir le champ `valid` dans le JSON. |
| 401 | Clé d'API manquante ou incorrecte. |
| 403 | IP d'origine non autorisée. |
| 500 | Erreur serveur (BDD inaccessible par exemple). |

### Timeout

L'API quadrant configure un timeout cURL de 5 secondes. L'endpoint côté site hôte doit donc répondre rapidement (idéalement < 500 ms).

---

## 3. Comportement attendu en cas de changement de casquette

Quand l'utilisateur change de contexte (par exemple un rectorat passe d'un étab à un autre, ou un national bascule sur un nouvel étab), le site hôte doit :

1. Générer (ou récupérer) un **nouveau** `token_campagne_utilisateurs` pour le nouveau contexte
2. Insérer/mettre à jour la ligne dans `dial_campagne_utilisateurs_connexions`
3. Régénérer la page contenant l'iframe avec ce nouveau token

L'iframe sera donc rechargée complètement avec un nouveau contexte, ce qui est le comportement souhaité (le contexte est figé pour la durée de vie de chaque instance d'iframe).

---

## 4. Sécurité — récapitulatif

| Élément | Responsabilité site hôte | Responsabilité API quadrant |
|---|---|---|
| HTTPS | À garantir | À garantir |
| Génération des tokens | Oui (existant) | Non |
| Validité des tokens | Vérification dans `verify-session.php` | Pas de vérification autonome (délégation au site hôte) |
| Allowlist IP de l'endpoint vérif | Oui | (côté appelant, en sortie) |
| Clé d'API partagée | Stockage local + vérification | Stockage local + envoi |
| Cache de validation | Non | Oui (table `app_session_cache`, TTL ~5 min) |
| Prolongation `expirationForm` | Oui (à chaque vérif) | Non |
| Filtrage des données par contexte | Non | Oui (via `filtre_perimetre LIKE`) |
