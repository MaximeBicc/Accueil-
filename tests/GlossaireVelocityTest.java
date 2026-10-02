import java.io.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.VelocityEngine;

/** Exécute les véritables templates Velocity avec une API XWiki simulée. */
public class GlossaireVelocityTest {
  static final String SPACE = "TestPage.PAGE.Glossaire.DATA";
  static final Path ROOT = Path.of("xwiki/TestPage/PAGE/Glossaire");
  static final List<String> SPACES = List.of("TestPage", "PAGE", "Glossaire", "DATA");
  static final VelocityEngine ENGINE = new VelocityEngine();
  static int checks;

  public static class Ref {
    final String parent, name;
    Ref(String parent, String name) { this.parent = parent; this.name = name; }
    public String getParent() { return parent; }
    public String getName() { return name; }
    public String toString() { return parent + "." + name.replace("\\", "\\\\").replace(".", "\\."); }
    public boolean equals(Object other) { return other instanceof Ref r && parent.equals(r.parent) && name.equals(r.name); }
    public int hashCode() { return Objects.hash(parent, name); }
  }
  public static class Model {
    public Ref createDocumentReference(String wiki, List<String> spaces, String name) { return new Ref(String.join(".", spaces), name); }
    public Ref resolveDocument(String text) {
      int cut = -1;
      boolean escaped = false;
      for (int i = 0; i < text.length(); i++) {
        char c = text.charAt(i);
        if (!escaped && c == '.') cut = i;
        if (!escaped && c == '\\') escaped = true; else escaped = false;
      }
      String name = text.substring(cut + 1).replace("\\.", ".").replace("\\\\", "\\");
      return new Ref(cut < 0 ? SPACE : text.substring(0, cut), name);
    }
    public String serialize(Ref ref) { return ref.toString(); }
    public String serialize(Ref ref, String hint) { return ref.toString(); }
  }
  public static class Obj {
    final Map<String, String> values = new HashMap<>();
    public String getValue(String key) { return values.getOrDefault(key, ""); }
    public void set(String key, String value) { values.put(key, value); }
  }
  public static class Doc {
    final Wiki wiki; final Ref ref; Obj obj; String title = "";
    Doc(Wiki wiki, Ref ref) { this.wiki = wiki; this.ref = ref; }
    public boolean isNew() { return !wiki.docs.containsKey(ref); }
    public Obj getObject(String ignored) { return obj; }
    public Obj newObject(String ignored) { obj = new Obj(); return obj; }
    public String getFullName() { return ref.toString(); }
    public String getName() { return ref.name; }
    public String getURL() { return "/glossaire"; }
    public void setTitle(String value) { title = value; }
    public void save(String message, boolean minor) { wiki.docs.put(ref, this); }
  }
  public static class Extension { public void use(String ignored) {} }
  public static class Wiki {
    final Map<Ref, Doc> docs = new LinkedHashMap<>();
    boolean allowed = true;
    public Extension getJsx() { return new Extension(); }
    public Extension getSsx() { return new Extension(); }
    public Doc getDocument(Object ref) {
      Ref reference = ref instanceof Ref r ? r : new Model().resolveDocument(String.valueOf(ref));
      return docs.getOrDefault(reference, new Doc(this, reference));
    }
    public boolean hasAccessLevel(String right, String user, String reference) { return allowed; }
    public List<String> getSpaceDocsName(String space) {
      return docs.keySet().stream().filter(r -> r.parent.equals(space)).map(r -> r.name).toList();
    }
    Doc add(String name, String acronym) {
      Doc d = getDocument(new Ref(SPACE, name)); d.newObject("");
      d.obj.set("acronyme", acronym); d.obj.set("libelle", "Libellé " + acronym); d.obj.set("definition", "Définition");
      d.save("", false); return d;
    }
  }
  public static class Session {
    final Map<String, Object> attrs = new HashMap<>();
    public void setAttribute(String key, Object value) { attrs.put(key, value); }
    public Object getAttribute(String key) { return attrs.get(key); }
    public void removeAttribute(String key) { attrs.remove(key); }
  }
  public static class Request {
    final Map<String, String> params = new LinkedHashMap<>();
    final Session session = new Session(); String method = "POST";
    public String getParameter(String key) { return params.get(key); }
    public Map<String, String> getParameterMap() { return params; }
    public String getMethod() { return method; }
    public Session getSession() { return session; }
    public String getAcronyme() { return params.get("acronyme"); }
    public String getLibelle() { return params.get("libelle"); }
    public String getDefinition() { return params.get("definition"); }
  }
  public static class Response {
    final StringWriter body = new StringWriter(); final PrintWriter writer = new PrintWriter(body);
    public PrintWriter getWriter() { return writer; }
    public void setContentType(String type) {}
    public void sendRedirect(String url) {}
  }
  public static class Context {
    public String getUser() { return "XWiki.Test"; }
    public void setFinished(boolean value) {}
  }
  public static class Escape {
    public String url(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    public String xml(Object value) {
      return String.valueOf(value == null ? "" : value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }
  }
  public static class Csrf {
    public boolean isTokenValid(String token) { return "test-token".equals(token); }
    public String getToken() { return "test-token"; }
  }
  public static class Icon { public String renderHTML(String name) { return "<span>" + name + "</span>"; } }
  public static class MoveRequest {
    Ref source, target; boolean autoRedirect = true, deep, interactive = true;
    public void setAutoRedirect(boolean value) { autoRedirect = value; }
    public void setDeep(boolean value) { deep = value; }
    public void setInteractive(boolean value) { interactive = value; }
    public void setUpdateLinks(boolean value) {}
    public void setUpdateParentField(boolean value) {}
  }
  public static class Factory {
    public MoveRequest createRenameRequest(Ref source, Ref target) {
      MoveRequest r = new MoveRequest(); r.source = source; r.target = target; return r;
    }
    public MoveRequest createDeleteRequest(List<Ref> refs) { return createRenameRequest(refs.get(0), null); }
  }
  public static class Job {
    final Runnable action;
    Job(Runnable action) { this.action = action; }
    public void join() { action.run(); }
  }
  public static class Refactoring {
    final Wiki wiki; String failure = ""; int calls;
    Refactoring(Wiki wiki) { this.wiki = wiki; }
    public Factory getRequestFactory() { return new Factory(); }
    public Job rename(MoveRequest r) {
      calls++;
      if (failure.equals("null")) return null;
      return new Job(() -> {
        if (failure.equals("noop")) return;
        Doc source = wiki.getDocument(r.source), dest = wiki.getDocument(r.target);
        dest.obj = source.obj; dest.save("", false);
        if (!r.autoRedirect && !failure.equals("retain")) wiki.docs.remove(r.source);
      });
    }
    public Job delete(MoveRequest r) {
      calls++;
      if (failure.equals("null")) return null;
      return new Job(() -> { if (!failure.equals("noop")) wiki.docs.remove(r.source); });
    }
  }
  public static class Fixture {
    final Wiki wiki = new Wiki(); final Request request = new Request(); final Refactoring refactoring = new Refactoring(wiki);
    Fixture() { request.params.put("form_token", "test-token"); }
    String render(String filename, String action, String... pairs) throws Exception {
      request.params.put("action", action);
      for (int i = 0; i < pairs.length; i += 2) request.params.put(pairs[i], pairs[i + 1]);
      Response response = new Response(); VelocityContext context = new VelocityContext();
      context.put("xwiki", wiki); context.put("request", request); context.put("response", response);
      context.put("doc", wiki.getDocument(new Ref("TestPage.PAGE.Glossaire", "WebHome")));
      context.put("xcontext", new Context()); context.put("escapetool", new Escape());
      context.put("services", Map.of("model", new Model(), "csrf", new Csrf(), "refactoring", refactoring, "icon", new Icon()));
      String template = Files.readString(ROOT.resolve(filename)).replaceAll("\\{\\{[^}]*}}", "");
      StringWriter output = new StringWriter(); ENGINE.evaluate(context, output, filename, template);
      return filename.startsWith("DATA/") ? response.body.toString().trim() : output.toString();
    }
    String save(String source, String acronym) throws Exception {
      return render("DATA/WebHome.xwiki", "save", "targetRef", source, "acronym", acronym, "label", "Nouveau libellé", "definition", "Nouvelle définition");
    }
    String delete(String source) throws Exception { return render("DATA/WebHome.xwiki", "delete", "targetRef", source); }
  }
  static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
  public static void main(String[] args) throws Exception {
    ENGINE.init();
    Fixture f = new Fixture(); Doc source = f.wiki.add("API", "API");
    String result = f.save(source.getFullName(), "NOUVEAU");
    check(result.startsWith("GLOSSAIRE_OK|"), "renommage : " + result);
    check(source.isNew() && f.wiki.docs.size() == 1, "aucune ancienne page après renommage");
    String renamedRef = f.wiki.docs.keySet().iterator().next().toString();
    check(f.delete(renamedRef).equals("GLOSSAIRE_OK") && f.wiki.docs.isEmpty(), "suppression après renommage");
    for (String failure : List.of("null", "noop", "retain")) {
      f = new Fixture(); source = f.wiki.add("API", "API"); f.refactoring.failure = failure;
      check(f.save(source.getFullName(), "NOUVEAU").startsWith("GLOSSAIRE_ERROR|"), "renommage échoué : " + failure);
    }
    for (String failure : List.of("null", "noop")) {
      f = new Fixture(); source = f.wiki.add("API", "API"); f.refactoring.failure = failure;
      check(f.delete(source.getFullName()).startsWith("GLOSSAIRE_ERROR|") && !source.isNew(), "suppression échouée : " + failure);
    }
    f = new Fixture(); source = f.wiki.add("API", "API"); Doc occupied = f.wiki.add("NOUVEAU", "NOUVEAU");
    check(f.save(source.getFullName(), "NOUVEAU").endsWith("|NOUVEAU_1") && !occupied.isNew(), "collision conservée");
    f = new Fixture(); source = f.wiki.add("A.B", "A.B");
    check(f.save(source.getFullName(), "C|D\" E").startsWith("GLOSSAIRE_OK|") && source.isNew(), "caractères spéciaux");
    f = new Fixture(); source = f.wiki.add("API", "API"); f.request.method = "GET";
    check(f.delete(source.getFullName()).startsWith("GLOSSAIRE_ERROR|") && !source.isNew(), "GET sans mutation");
    f.request.method = "POST"; f.request.params.put("form_token", "bad");
    check(f.delete(source.getFullName()).startsWith("GLOSSAIRE_ERROR|"), "CSRF refusé");
    f = new Fixture(); source = f.wiki.add("API", "API"); f.wiki.allowed = false;
    check(f.save(source.getFullName(), "NOUVEAU").startsWith("GLOSSAIRE_ERROR|") && f.refactoring.calls == 0, "droits refusés");
    f = new Fixture(); Ref foreign = new Ref("Autre.Espace", "Page"); source = f.wiki.getDocument(foreign); source.newObject(""); source.save("", false);
    check(f.delete(foreign.toString()).startsWith("GLOSSAIRE_ERROR|") && !source.isNew(), "suppression limitée aux fiches");
    f = new Fixture();
    String html = f.render("WebHome.xwiki", "checkAndCreate", "acronyme", "API", "libelle", "Interface");
    check(f.wiki.docs.size() == 1, "création valide");
    for (String invalid : List.of("", "   ", "A/B")) {
      f = new Fixture(); html = f.render("WebHome.xwiki", "checkAndCreate", "acronyme", invalid, "libelle", "Interface");
      check(f.wiki.docs.isEmpty() && html.contains("alert-danger"), "création invalide : " + invalid);
    }
    f = new Fixture();
    for (int i = 0; i < 100; i++) f.wiki.add(i == 0 ? "API" : "API_" + i, "API");
    html = f.render("WebHome.xwiki", "checkAndCreate", "acronyme", "API", "libelle", "Interface");
    check(f.wiki.docs.size() == 100 && html.contains("Impossible de trouver"), "épuisement des noms");
    f = new Fixture(); source = f.wiki.add("A.B", "A.B"); source.obj.set("libelle", "<img src=x onerror=alert(1)>"); source.obj.set("definition", "</textarea><script>alert(1)</script>");
    html = f.render("WebHome.xwiki", "");
    check(html.contains("A.B") && html.contains("&lt;img") && !html.contains("<script>"), "affichage échappé et nom contenant un point");
    if (args.length > 0) Files.writeString(Path.of(args[0]), html);
    f = new Fixture();
    result = f.render("DATA/WebHome.xwiki", "import", "acronym_0", "A.B", "label_0", "Interface", "definition_0", "<texte>", "acronym_1", "A.B", "label_1", "Interface");
    check(result.contains("ROW_OK|0|") && result.contains("ROW_SKIP|1|") && f.wiki.docs.size() == 1, "import et doublons : " + result);
    System.out.println(checks + " vérifications Velocity réussies.");
  }
}
