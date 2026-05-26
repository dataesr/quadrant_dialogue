<?php
declare(strict_types=1);

/**
 * GET /frontend-config
 *
 * Expose au frontend les flags de configuration applicables côté UI :
 * activation des boutons d'export (PNG, XLSX, fiche Word). Permet
 * de désactiver un export sans déployer de nouveau bundle JS.
 *
 * Aucune authentification requise — les flags sont publics et ne
 * révèlent aucune donnée sensible. Le seuil de diffusion configuré
 * (`seuil_diffusable`) n'est PAS exposé : l'API l'applique de
 * manière transparente quand `?for_export=1` est passé sur les
 * endpoints de données. Le révéler permettrait de calibrer une
 * tentative de déduction d'effectifs sous-seuil.
 *
 * Fallback côté frontend : si l'endpoint est injoignable (404,
 * réseau coupé), le hook useFrontendConfig retombe sur « tous les
 * exports activés » — comportement permissif, l'export reste
 * fonctionnel par défaut.
 */

require_once __DIR__ . '/../lib/Response.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error('method_not_allowed', 'Seul GET est autorisé sur cet endpoint.', 405);
}

$config = require __DIR__ . '/../config/config.php';

$exports = $config['exports'] ?? [];

echo json_encode([
    'exports' => [
        // Défaut à true : si la clé manque dans config.php (par ex.
        // après upgrade sans synchroniser config.example.php), on
        // garde la fonctionnalité activée plutôt que de casser
        // silencieusement.
        'png_enabled'        => $exports['png_enabled']        ?? true,
        'xlsx_enabled'       => $exports['xlsx_enabled']       ?? true,
        'docx_fiche_enabled' => $exports['docx_fiche_enabled'] ?? true,
    ],
]);
