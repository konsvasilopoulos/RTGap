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
import re, shutil
ver = re.search(r"const VERSION = '([^']+)'", (here / "engine.js").read_text("utf-8")).group(1)
for f in (here / "pwa").iterdir():
    if f.suffix in (".html", ".js", ".webmanifest"):
        (out / f.name).write_text(f.read_text("utf-8").replace("__VERSION__", ver), "utf-8")
    else:
        shutil.copy(f, out / f.name)
shutil.copy(here.parent / "docs" / "screenshot.png", out / "screenshot.png")
# validation page: the engine inlined, numbers from the last cross-validation run, other programs' values from validation/
summ = json.loads((here / "xval" / "summary.json").read_text("utf-8"))
other = json.loads((here.parent / "validation" / "lql_equiv.json").read_text("utf-8"))
val = (here / "validation.tpl.html").read_text("utf-8").replace("/*__ENGINE__*/", (here / "engine.js").read_text("utf-8")).replace("/*__LQLEQUIV__*/{}", json.dumps(other["eqd2"]))
for k, v in {"__VERSION__": ver, "__CASES__": summ["cases"], "__OPTIONS__": summ["options"], "__MISMATCH__": summ["mismatches"], "__PYTEST__": summ["pytest"], "__DATE__": summ["date"]}.items():
    val = val.replace(k, str(v))
(out / "validation.html").write_text(val, "utf-8")
print("dist/index.html", len(html) // 1024, "KiB")
