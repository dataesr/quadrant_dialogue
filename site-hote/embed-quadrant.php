<?php
/**
 * Composant d'embarquement de l'iframe quadrant.
 *
 * À inclure dans toute page du site hôte qui doit afficher l'iframe.
 * Génère un formulaire HTML caché qui transmet les 3 tokens à l'iframe par POST,
 * puis se soumet automatiquement au chargement.
 *
 * USAGE :
 *
 *   <?php
 *   // Au moment où on veut afficher l'iframe sur une page :
 *   require_once 'embed-quadrant.php';
 *   embedQuadrant(array(
 *       'tokenConnexion' => $_SESSION['tokenConnexion'],
 *       'token'          => $_SESSION['token'],
 *       'tokenCampagne'  => $tokenCampagneCourant,
 *       'iframeUrl'      => 'https://quadrant.exemple.fr/api/auth/init',
 *       'height'         => 800,
 *   ));
 *   ?>
 *
 * COMPATIBILITÉ : PHP 5.6 strict.
 */

if (!function_exists('embedQuadrant')) {

/**
 * Génère et affiche le code HTML pour embarquer l'iframe quadrant.
 *
 * @param array $params Tableau associatif :
 *   - tokenConnexion (obligatoire) : UUID 36 caractères
 *   - token          (obligatoire) : identifiant utilisateur 35 caractères
 *   - tokenCampagne  (obligatoire) : token_campagne_utilisateurs 26 caractères
 *   - iframeUrl      (obligatoire) : URL de l'iframe quadrant
 *   - height         (optionnel)   : hauteur de l'iframe en pixels (défaut 800)
 *   - iframeId       (optionnel)   : ID HTML de l'iframe (défaut 'quadrant-iframe')
 */
function embedQuadrant($params)
{
    // Validation
    $required = array('tokenConnexion', 'token', 'tokenCampagne', 'iframeUrl');
    foreach ($required as $key) {
        if (empty($params[$key])) {
            throw new InvalidArgumentException("embedQuadrant: paramètre manquant '$key'");
        }
    }

    $iframeId = isset($params['iframeId']) ? $params['iframeId'] : 'quadrant-iframe';
    $height   = isset($params['height'])   ? (int)$params['height'] : 800;
    $formId   = $iframeId . '-form';

    // Échappement HTML strict pour toutes les valeurs injectées
    $tokenConnexion = htmlspecialchars($params['tokenConnexion'], ENT_QUOTES, 'UTF-8');
    $token          = htmlspecialchars($params['token'],          ENT_QUOTES, 'UTF-8');
    $tokenCampagne  = htmlspecialchars($params['tokenCampagne'],  ENT_QUOTES, 'UTF-8');
    $iframeUrl      = htmlspecialchars($params['iframeUrl'],      ENT_QUOTES, 'UTF-8');
    $iframeId       = htmlspecialchars($iframeId, ENT_QUOTES, 'UTF-8');
    $formId         = htmlspecialchars($formId,   ENT_QUOTES, 'UTF-8');
    ?>

<!-- =============================================================================
     Embarquement iframe quadrant
     Les 3 tokens sont transmis par POST caché à l'iframe (jamais en URL).
     ============================================================================= -->

<iframe id="<?php echo $iframeId; ?>"
        name="<?php echo $iframeId; ?>"
        src="about:blank"
        width="100%"
        height="<?php echo $height; ?>"
        style="border: none; display: block;"
        title="Quadrant des indicateurs"></iframe>

<form id="<?php echo $formId; ?>"
      action="<?php echo $iframeUrl; ?>"
      method="POST"
      target="<?php echo $iframeId; ?>"
      style="display: none;">
    <input type="hidden" name="tokenConnexion" value="<?php echo $tokenConnexion; ?>">
    <input type="hidden" name="token" value="<?php echo $token; ?>">
    <input type="hidden" name="token_campagne_utilisateurs" value="<?php echo $tokenCampagne; ?>">
</form>

<script>
    (function() {
        // Auto-soumission du formulaire dès que possible
        var form = document.getElementById('<?php echo $formId; ?>');
        if (form) {
            form.submit();
        }
    })();
</script>

<?php
}

} // fin if (!function_exists)
