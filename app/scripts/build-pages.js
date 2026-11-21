// Pages publiques App Store (confidentialité, conditions, support) : store/*.md → ../docs/*.html, servies par GitHub Pages
// (https://markheagan-cloud.github.io/fitaia/). Adresse de contact dans store/contact.json. Usage : node scripts/build-pages.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, '..', 'docs');
const { email } = JSON.parse(fs.readFileSync(path.join(root, 'store', 'contact.json'), 'utf8'));
if (!email || !email.includes('@')) throw new Error('store/contact.json : adresse email de support manquante');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\{\{EMAIL_SUPPORT\}\}/g, `<a href="mailto:${email}">${email}</a>`);

function md(src) {
  const html = [];
  let list = null;
  const close = () => { if (list) { html.push(`</${list}>`); list = null; } };
  for (const line of src.split('\n')) {
    let m;
    if ((m = line.match(/^(#{1,3}) (.*)/))) { close(); html.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^- (.*)/))) { if (list !== 'ul') { close(); html.push('<ul>'); list = 'ul'; } html.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\d+\. (.*)/))) { if (list !== 'ol') { close(); html.push('<ol>'); list = 'ol'; } html.push(`<li>${inline(m[1])}</li>`); }
    else if (line.trim() === '') close();
    else { close(); html.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return html.join('\n');
}

const page = (title, body) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — FITAIA</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px;line-height:1.55;color:#1c1d1f;background:#f6f4ef}
a{color:#c0392b}h1{font-size:1.6em}nav a{margin-right:14px}</style></head>
<body><nav><a href="index.html">FITAIA</a><a href="confidentialite.html">Confidentialité</a><a href="conditions.html">Conditions</a><a href="support.html">Support</a></nav>
${body}
</body></html>
`;

fs.mkdirSync(out, { recursive: true });
const write = (name, title, body) => fs.writeFileSync(path.join(out, name), page(title, body));
write('confidentialite.html', 'Confidentialité', md(fs.readFileSync(path.join(root, 'store', 'privacy.md'), 'utf8')));
write('conditions.html', 'Conditions', md(fs.readFileSync(path.join(root, 'store', 'terms.md'), 'utf8')));
write('support.html', 'Support', md(`# Support FITAIA\n\nUne question, un problème avec ton perso, tes défis ou ton journal ? Écris-nous : {{EMAIL_SUPPORT}}. Réponse sous 48 h.\n\nTes données sont sur ton téléphone : pour tout effacer, supprime l'app.`));
write('index.html', 'Accueil', md(`# FITAIA\n\nDéfis comptés par la caméra, repas scannés, et un perso à ton image qui évolue avec toi. Gratuit, sans publicité.\n\nContact : {{EMAIL_SUPPORT}}`));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Pages écrites dans', out);
