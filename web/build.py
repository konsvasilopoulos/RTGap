"""Build the single-file web app: dist/index.html (no build tools needed)."""
import json, pathlib, yaml
here = pathlib.Path(__file__).parent
sites = yaml.safe_load((here.parent / "rtgap/data/sites.yaml").read_text("utf-8"))["sites"]
(here / "sites.json").write_text(json.dumps(sites, ensure_ascii=False), "utf-8")
html = (here / "index.tpl.html").read_text("utf-8")
rep = {"/*__CSS__*/": "style.css", "/*__ENGINE__*/": "engine.js", "/*__I18N__*/": "i18n.js", "/*__PDF__*/": "pdf.js", "/*__APP__*/": "app.js"}
for k, f in rep.items():
    src = (here / f).read_text("utf-8")
    assert "</script" not in src
    html = html.replace(k, src)
html = html.replace("/*__SITES__*/", json.dumps(sites, ensure_ascii=False).replace("</", "<\\/"))
out = here.parent / "dist"; out.mkdir(exist_ok=True)
(out / "index.html").write_text(html, "utf-8")
print("dist/index.html", len(html) // 1024, "KiB")
