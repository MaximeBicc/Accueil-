import java.io.*;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.VelocityEngine;

/** Exécute les véritables templates Velocity avec une API XWiki simulée. */
public class LiensVelocityTest {
  static final String SPACE = "TestPage.PAGE.Liens.DATA.LIENDATA.Test";
  static final Path ROOT = Path.of("xwiki/TestPage/PAGE");
  static final List<String> SPACES = List.of("TestPage", "PAGE", "Liens", "DATA", "LIENDATA", "Test");
  static final VelocityEngine ENGINE = new VelocityEngine();
  static int checks;

  public static class Ref {
    final String parent, name;
    Ref(String parent, String name) { this.parent = parent; this.name = name; }
    public String getParent() { return parent; }
    public WikiRef getWikiReference() { return new WikiRef(parent.contains(":") ? parent.substring(0, parent.indexOf(":")) : "xwiki"); }
    public String getName() { return name; }
    public String toString() { return parent + "." + name.replace("\\", "\\\\").replace(".", "\\."); }
    public boolean equals(Object other) { return other instanceof Ref r && parent.equals(r.parent) && name.equals(r.name); }
    public int hashCode() { return Objects.hash(parent, name); }
  }
  public static class WikiRef {
    final String name; WikiRef(String name) { this.name = name; }
    public String getName() { return name; }
    public boolean equals(Object other) { return other instanceof WikiRef ref && name.equals(ref.name); }
    public int hashCode() { return name.hashCode(); }
  }
  public static class Model {
    public Ref createDocumentReference(String wiki, List<String> spaces, String name) { return new Ref((wiki.isEmpty() || wiki.equals("xwiki") ? "" : wiki + ":") + String.join(".", spaces), name); }
    public Ref resolveDocument(String text) {
      if (text.startsWith("xwiki:")) text = text.substring(6);
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
    public String serialize(String reference) { return reference; }
    public String serialize(Ref ref, String hint) { return ref.toString(); }
  }
  public static class Obj {
    final Map<String, String> values = new HashMap<>();
    String missingField = "";
    public String getValue(String key) { return values.getOrDefault(key, ""); }
    public void set(String key, String value) { if (!key.equals(missingField)) values.put(key, value); }
  }
  public static class Doc {
    final Wiki wiki; final Ref ref; Obj obj; String objClass = "", title = "", content = ""; int saves;
    Doc(Wiki wiki, Ref ref) { this.wiki = wiki; this.ref = ref; }
    public boolean isNew() { return !wiki.docs.containsKey(ref) && !wiki.profiles.containsKey(ref); }
    public Obj getObject(String type) { return objClass.equals(type) || (objClass.equals("") && type.endsWith("lienClass.WebHome")) ? obj : null; }
    public Obj newObject(String type) { obj = new Obj(); objClass = type; obj.missingField = wiki.missingField; return obj; }
    public String getFullName() { return ref.toString(); }
    public String getName() { return ref.name; }
    public String getContent() { return content; }
    public void setContent(String value) { content = value; }
    public Ref getDocumentReference() { return ref; }
    public String getURL() { return "/liens"; }
    public String getURL(String name) { return "/liens"; }
    public void setTitle(String value) { title = value; }
    public void save(String message, boolean minor) {
      if (!wiki.refuseSave) { saves++; (objClass.equals("XWiki.XWikiUsers") ? wiki.profiles : wiki.docs).put(ref, this); }
    }
    public String getVersion() { return "1." + (saves + 1); }
  }
  public static class Extension { public void use(String ignored) {} }
  public static class Wiki {
    final Map<Ref, Doc> docs = new LinkedHashMap<>();
    final Map<Ref, Doc> profiles = new LinkedHashMap<>();
    boolean allowed = true, admin, configurationReadable = true, refuseSave, emptyUserQuery; String missingField = "";
    final Deque<String> pageNames = new ArrayDeque<>();
    int uniqueCalls;
    public String getUniquePageName(String space) {
      uniqueCalls++;
      return pageNames.isEmpty() ? String.format("%016x", uniqueCalls) : pageNames.removeFirst();
    }
    public boolean hasWikiAdminRights() { return admin; }
    public Doc getDocumentAsAuthor(Object ref) { return configurationReadable ? getDocument(ref) : null; }
    public String getURL(String ref, String action) {
      return ref.equals("TestPage.PAGE.Liens.DATA.WebHome") ? "/bin/view/TestPage/PAGE/Liens/DATA/" : "/liens";
    }
    public Extension getJsx() { return new Extension(); }
    public Extension getSsx() { return new Extension(); }
    public Doc getDocument(Object ref) {
      Ref reference = ref instanceof Ref r ? r : new Model().resolveDocument(String.valueOf(ref));
      return docs.getOrDefault(reference, profiles.getOrDefault(reference, new Doc(this, reference)));
    }
    public boolean hasAccessLevel(String right, String user, String reference) { return allowed; }
    public List<String> getSpaceDocsName(String space) {
      return java.util.stream.Stream.concat(docs.keySet().stream(), profiles.keySet().stream()).filter(r -> r.parent.equals(space)).map(r -> r.name).toList();
    }
    Doc add(String name, String acronym) {
      Doc d = getDocument(new Ref(SPACE, name)); d.newObject("");
      d.obj.set("nom_lien", acronym); d.obj.set("lien", "Libellé " + acronym);
      d.obj.set("type", "personnel"); d.obj.set("proprietaire", "Test"); d.obj.set("definition", "Définition");
      d.save("", false); return d;
    }
    Doc profile(String id, String first, String last) {
      Doc d = getDocument(new Ref("XWiki", id)); d.newObject("XWiki.XWikiUsers");
      d.obj.set("first_name", first); d.obj.set("last_name", last); d.save("", false); return d;
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
    String user = "XWiki.Test";
    public String getUser() { return user; }
    public Ref getUserReference() { return new Model().resolveDocument(user); }
    public void setFinished(boolean value) {}
  }
  public static class Escape {
    public String url(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    public String html(Object value) { return xml(value); }
    public String javascript(Object value) { return String.valueOf(value); }
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
        dest.obj = source.obj; dest.objClass = source.objClass; dest.content = source.content; dest.title = source.title; dest.save("", false);
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
    final Groups groups = new Groups(); final Context userContext = new Context();
    Fixture() {
      request.params.put("form_token", "test-token");
      wiki.profile("Test", "Test", ""); wiki.profile("Autre", "Autre", "auteur");
    }
    String render(String filename, String action, String... pairs) throws Exception {
      request.params.put("action", action);
      for (int i = 0; i < pairs.length; i += 2) request.params.put(pairs[i], pairs[i + 1]);
      Response response = new Response(); VelocityContext context = new VelocityContext();
      context.put("xwiki", wiki); context.put("request", request); context.put("response", response);
      context.put("doc", wiki.getDocument(new Ref("TestPage.PAGE.Lien-test", "WebHome")));
      context.put("xcontext", userContext); context.put("escapetool", new Escape());
      context.put("services", Map.of("model", new Model(), "csrf", new Csrf(), "refactoring", refactoring, "icon", new Icon(), "user", new UserService(groups), "query", new Queries(wiki)));
      String template = Files.readString(ROOT.resolve(filename.equals("WebHome.xwiki") ? "Lien-test/WebHome.xwiki" : "Liens/" + filename)).replaceAll("\\{\\{[^}]*}}", "");
      StringWriter output = new StringWriter(); ENGINE.evaluate(context, output, filename, template);
      return filename.startsWith("DATA/") ? response.body.toString().trim() : output.toString();
    }
    String save(String source, String acronym) throws Exception {
      return render("DATA/WebHome.xwiki", "save", "targetRef", source, "acronym", acronym, "label", "Nouveau libellé", "definition", "Nouvelle définition", "type", "personnel", "proprietaire", "Test");
    }
    String delete(String source) throws Exception { return render("DATA/WebHome.xwiki", "delete", "targetRef", source); }
  }
  public static class Groups {
    boolean manager;
    final Set<Ref> memberships = new LinkedHashSet<>();
    final Map<Ref, List<Ref>> members = new LinkedHashMap<>();
    void addMembers(String group, String... users) {
      List<Ref> list = members.computeIfAbsent(new Model().resolveDocument(group), key -> new ArrayList<>());
      for (String user : users) list.add(new Model().resolveDocument(user));
    }
    public List<Ref> getGroups(Ref user, WikiRef wiki, boolean recursive) {
      List<Ref> result = new ArrayList<>();
      if (manager) for (String name : List.of("XWiki.IVQ_Gestionnaires", "XWiki.IVQ_Gestionnaire")) result.add(new Model().resolveDocument(name));
      for (Ref group : memberships) if (group.getWikiReference().name.equals(wiki.name)) result.add(group);
      return result;
    }
    // Signature réelle de GroupScriptService : DocumentReference, boolean.
    public List<Ref> getMembers(Ref group, boolean recursive) {
      Set<Ref> found = new LinkedHashSet<>(); Deque<Ref> pending = new ArrayDeque<>(); pending.add(group);
      Set<Ref> visited = new HashSet<>();
      while (!pending.isEmpty()) {
        Ref current = pending.removeFirst(); if (!visited.add(current)) continue;
        List<Ref> direct = members.getOrDefault(current, List.of());
        if (manager && current.parent.equals("XWiki") && (current.name.equals("IVQ_Gestionnaires") || current.name.equals("IVQ_Gestionnaire"))) {
          direct = new ArrayList<>(direct); direct.add(new Ref("XWiki", "Test")); direct.add(new Ref("XWiki", "Autre"));
        }
        found.addAll(direct); if (recursive) pending.addAll(direct);
      }
      return new ArrayList<>(found);
    }
  }
  public static class UserService {
    final Groups groups; UserService(Groups groups) { this.groups = groups; }
    public Groups getGroup() { return groups; }
  }
  public static class Queries {
    final Wiki wiki; Queries(Wiki wiki) { this.wiki = wiki; }
    String query;
    public Queries xwql(String query) { this.query = query; return this; }
    public List<String> execute() {
      if (query.contains("XWiki.XWikiUsers")) return wiki.emptyUserQuery ? List.of() : wiki.profiles.values().stream().map(Doc::getFullName).sorted().toList();
      return wiki.docs.values().stream().filter(d -> query.contains("XWiki.XWikiGroups") ? d.objClass.equals("XWiki.XWikiGroups") : d.getObject("TestPage.PAGE.Liens.CODE.lienClass.WebHome") != null).map(Doc::getFullName).toList();
    }
  }
  static final String CONFIG_CLASS = "TestPage.PAGE.Liens.CODE.liensConfigurationClass.WebHome";
  static final String CONFIG_REF = "TestPage.PAGE.Liens.CODE.Configuration.WebHome";
  static Doc configure(Fixture f, int personal, int common) {
    Doc configuration = f.wiki.getDocument(CONFIG_REF); Obj object = configuration.newObject(CONFIG_CLASS);
    object.set("schemaVersion", "1");
    object.set("personalReadGroups", personal > 0 ? "XWiki.XWikiAllGroup" : "");
    object.set("personalWriteGroups", personal == 2 ? "XWiki.XWikiAllGroup" : "");
    object.set("commonReadGroups", common > 0 ? "XWiki.XWikiAllGroup" : "");
    object.set("commonWriteGroups", common == 2 ? "XWiki.XWikiAllGroup" : "");
    configuration.save("", false); return configuration;
  }
  static Doc common(Fixture f) {
    Doc d = f.wiki.add("COMMUN", "COMMUN"); d.obj.set("type", "commun"); return d;
  }
  static String settings(Fixture f, String group, String personal, String common) throws Exception {
    return f.render("DATA/WebHome.xwiki", "settings", "expectedVersion", f.wiki.getDocument(CONFIG_REF).getVersion(), "groupCount", "1", "group_0", group, "personal_0", personal, "common_0", common);
  }
  static void permissionsTests(String outputPath) throws Exception {
    String homeSource = Files.readString(ROOT.resolve("Lien-test/WebHome.xwiki"));
    String dataSource = Files.readString(ROOT.resolve("Liens/DATA/WebHome.xwiki"));
    String marker = "## BEGIN LIENS PERMISSIONS", end = "## END LIENS PERMISSIONS";
    check(homeSource.substring(homeSource.indexOf(marker), homeSource.indexOf(end)).equals(dataSource.substring(dataSource.indexOf(marker), dataSource.indexOf(end))), "même calcul des droits dans affichage et DATA");
    for (int personal = 0; personal <= 2; personal++) for (int common = 0; common <= 2; common++) {
      boolean readPersonal = personal > 0 || common == 2, writePersonal = personal == 2 || common == 2;
      boolean readCommon = common > 0, writeCommon = common == 2;
      Fixture f = new Fixture(); configure(f, personal, common); f.wiki.add("PRIVE", "PRIVE"); common(f);
      String html = f.render("WebHome.xwiki", "");
      check(html.contains("data-liens-tab=\"Tab1\"") == readPersonal && html.contains("id=\"Tab1\"") == readPersonal, "onglet Personnel " + personal + "/" + common);
      check(html.contains("data-liens-tab=\"Tab2\"") == readCommon && html.contains("id=\"Tab2\"") == readCommon, "onglet Commun " + personal + "/" + common);
      check(html.contains("toggleEditMode(this, true)") == writePersonal, "actions Personnel " + personal + "/" + common);
      check(html.contains("toggleEditMode2(this, true)") == writeCommon, "actions Commun " + personal + "/" + common);
      check(html.contains(">PRIVE<") == readPersonal && html.contains(">COMMUN<") == readCommon, "aucun texte interdit dans HTML " + personal + "/" + common);
      String list = f.render("DATA/WebHome.xwiki", "listVisible");
      check(list.contains("LIEN_ROW|") == (readPersonal || readCommon), "liste visible " + personal + "/" + common);
      check(list.contains("|PRIVE|") == readPersonal && list.contains("|COMMUN|") == readCommon, "liste filtrée " + personal + "/" + common);
      for (String kind : List.of("personnel", "commun")) for (String action : List.of("create", "save", "delete")) {
        f = new Fixture(); configure(f, personal, common);
        Doc source = kind.equals("personnel") ? f.wiki.add("PRIVE", "PRIVE") : common(f);
        String result;
        if (action.equals("delete")) result = f.delete(source.getFullName());
        else result = f.render("DATA/WebHome.xwiki", action, "targetRef", source.getFullName(), "acronym", "NOUVEAU", "label", "Libellé", "definition", "Définition", "type", kind, "proprietaire", "Test");
        boolean allowed = kind.equals("personnel") ? writePersonal : writeCommon;
        check(result.startsWith("GLOSSAIRE_OK") == allowed, action + " " + kind + " " + personal + "/" + common + " : " + result);
        if (!allowed) check(!source.isNew() && source.obj.getValue("nom_lien").equals(kind.equals("personnel") ? "PRIVE" : "COMMUN"), "refus sans mutation");
      }
      for (String kind : List.of("personnel", "commun")) {
        f = new Fixture(); configure(f, personal, common);
        int before = f.wiki.docs.size();
        f.render("WebHome.xwiki", "checkAndCreate", "acronyme", "MANUEL", "libelle", "Manuel", "definition", "Définition", "type", kind);
        boolean allowed = kind.equals("personnel") ? writePersonal : writeCommon;
        check(f.wiki.docs.size() == before + (allowed ? 1 : 0), "création manuelle " + kind + " " + personal + "/" + common);
      }
      if (writePersonal && !writeCommon) {
        f = new Fixture(); configure(f, personal, common); Doc source = f.wiki.add("PRIVE", "PRIVE");
        String result = f.render("DATA/WebHome.xwiki", "save", "targetRef", source.getFullName(), "acronym", "NOUVEAU", "label", "Libellé", "definition", "Définition", "type", "commun");
        check(!result.startsWith("GLOSSAIRE_OK") && !source.isNew() && source.obj.getValue("type").equals("personnel"), "changement vers Commun refusé sans son écriture");
      }
      if (outputPath != null) {
        f = new Fixture(); configure(f, personal, common); f.wiki.add("PRIVE", "PRIVE"); common(f);
        Files.writeString(Path.of(outputPath + ".p" + personal + "c" + common + ".html"), f.render("WebHome.xwiki", ""));
      }
    }
    Fixture f = new Fixture(); configure(f, 0, 0); f.groups.manager = true; f.wiki.add("PRIVE", "PRIVE");
    check(!f.render("DATA/WebHome.xwiki", "listVisible").contains("LIEN_ROW|"), "une configuration vide ne réactive pas les anciens gestionnaires");
    f.wiki.admin = true;
    String html = f.render("WebHome.xwiki", "");
    check(html.contains("id=\"btnLiensSettings\"") && !html.contains("id=\"Tab1\"") && !html.contains("id=\"Tab2\""), "administration sans droit fonctionnel implicite");
    if (outputPath != null) Files.writeString(Path.of(outputPath + ".admin.html"), html);
    f = new Fixture(); configure(f, 2, 2); f.wiki.admin = true;
    if (outputPath != null) Files.writeString(Path.of(outputPath + ".admin-writer.html"), f.render("WebHome.xwiki", ""));
    f = new Fixture(); configure(f, 0, 0);
    check(settings(f, "XWiki.XWikiAllGroup", "2", "2").startsWith("LIENS_ERROR|"), "paramètres réservés à admin");
    f.wiki.admin = true;
    String result = settings(f, "XWiki.XWikiAllGroup", "0", "2");
    check(result.equals("LIENS_SETTINGS_SAVED"), "enregistrement des paramètres : " + result);
    Obj config = f.wiki.getDocument(CONFIG_REF).getObject(CONFIG_CLASS);
    check(config.getValue("personalWriteGroups").equals("XWiki.XWikiAllGroup"), "Commun écriture implique Personnel écriture en stockage");
    f = new Fixture(); f.wiki.admin = true;
    check(settings(f, "XWiki.XWikiAllGroup", "1", "1").equals("LIENS_SETTINGS_SAVED") && !f.wiki.getDocument(CONFIG_REF).isNew(), "premier enregistrement crée la configuration");
    for (String invalid : List.of("3", "proposition", "-1")) {
      f = new Fixture(); f.wiki.admin = true;
      check(settings(f, "XWiki.XWikiAllGroup", invalid, "0").startsWith("LIENS_ERROR|"), "niveau invalide " + invalid);
    }
    f = new Fixture(); f.wiki.admin = true;
    check(settings(f, "XWiki.GroupeAbsent", "1", "0").startsWith("LIENS_ERROR|"), "groupe absent refusé");
    check(settings(f, "XWiki.GroupeAbsent", "0", "0").equals("LIENS_SETTINGS_SAVED"), "ancien groupe absent retirable");
    f = new Fixture(); f.wiki.admin = true;
    check(settings(f, "XWiki.XWikiGuest", "0", "2").startsWith("LIENS_ERROR|"), "visiteurs sans écriture");
    check(settings(f, "XWiki.XWikiGuest", "0", "1").equals("LIENS_SETTINGS_SAVED"), "lecture commune pour visiteurs");
    f.userContext.user = "XWiki.XWikiGuest"; common(f);
    check(f.render("DATA/WebHome.xwiki", "listVisible").contains("|COMMUN|"), "visiteur lit Commun explicitement autorisé");
    check(!f.render("WebHome.xwiki", "").contains("id=\"Tab1\""), "aucun Personnel visiteur");
    f = new Fixture(); f.wiki.admin = true; f.wiki.configurationReadable = false;
    check(settings(f, "XWiki.XWikiAllGroup", "2", "2").startsWith("LIENS_ERROR|"), "configuration illisible refusée");
    f.wiki.add("PRIVE", "PRIVE");
    check(!f.render("WebHome.xwiki", "").contains("id=\"Tab1\""), "pas de repli permissif si configuration illisible");
    f = new Fixture(); f.wiki.admin = true; f.wiki.missingField = "commonWriteGroups";
    check(settings(f, "XWiki.XWikiAllGroup", "0", "2").startsWith("LIENS_ERROR|"), "classe incomplète refusée");
    f = new Fixture(); f.wiki.admin = true; f.wiki.refuseSave = true;
    check(settings(f, "XWiki.XWikiAllGroup", "2", "2").startsWith("LIENS_ERROR|"), "sauvegarde silencieusement annulée refusée");
    f = new Fixture(); f.wiki.admin = true;
    check(f.render("DATA/WebHome.xwiki", "settings", "expectedVersion", "obsolète").startsWith("LIENS_ERROR|"), "version périmée refusée");
    f = new Fixture(); f.wiki.admin = true; f.request.method = "GET";
    check(settings(f, "XWiki.XWikiAllGroup", "2", "2").equals("ERREUR_METHOD"), "paramètres GET refusés");
    f.request.method = "POST"; f.request.params.put("form_token", "bad");
    check(settings(f, "XWiki.XWikiAllGroup", "2", "2").equals("ERREUR_CSRF"), "paramètres CSRF refusés");
    f = new Fixture(); f.wiki.admin = true;
    check(f.render("DATA/WebHome.xwiki", "settings", "expectedVersion", "1.1", "groupCount", "2", "group_0", "XWiki.XWikiAllGroup", "personal_0", "0", "common_0", "1", "group_1", "XWiki.XWikiAllGroup", "personal_1", "2", "common_1", "2").startsWith("LIENS_ERROR|"), "doublon de groupe refusé");
    f = new Fixture(); configure(f, 0, 0);
    check(!f.render("DATA/WebHome.xwiki", "create", "acronym", "FORGE", "label", "Libellé", "definition", "Définition", "type", "commun", "canWriteCommon", "true").startsWith("GLOSSAIRE_OK"), "droit transmis par le navigateur ignoré");
    f = new Fixture(); f.wiki.admin = true;
    check(f.render("DATA/WebHome.xwiki", "settings", "expectedVersion", "1.1", "groupCount", "2", "group_0", "XWiki.XWikiAllGroup", "personal_0", "0", "common_0", "1").startsWith("LIENS_ERROR|"), "formulaire incomplet refusé");
    f = new Fixture(); Doc configDoc = configure(f, 0, 0);
    configDoc.obj.set("personalReadGroups", "XWiki.Lecteurs");
    configDoc.obj.set("commonWriteGroups", "autre:XWiki.Contributeurs");
    f.groups.memberships.add(new Model().resolveDocument("XWiki.Lecteurs"));
    f.groups.memberships.add(new Model().resolveDocument("autre:XWiki.Contributeurs"));
    f.wiki.add("PRIVE", "PRIVE"); common(f);
    html = f.render("WebHome.xwiki", "");
    check(html.contains("data-can-write-personal=\"true\"") && html.contains("data-can-write-common=\"true\""), "union des groupes et groupe autre wiki");
    configDoc.obj.set("schemaVersion", "inconnue");
    check(!f.render("WebHome.xwiki", "").contains("id=\"Tab1\""), "version de configuration inconnue fermée");
  }

  static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
  static void authorTests() throws Exception {
    Fixture f = new Fixture(); f.groups.manager = true;
    String homeSource = Files.readString(ROOT.resolve("Lien-test/WebHome.xwiki"));
    String dataSource = Files.readString(ROOT.resolve("Liens/DATA/WebHome.xwiki"));
    String begin = "## BEGIN LIENS AUTHORS", end = "## END LIENS AUTHORS";
    check(homeSource.substring(homeSource.indexOf(begin), homeSource.indexOf(end)).equals(dataSource.substring(dataSource.indexOf(begin), dataSource.indexOf(end))), "même définition des auteurs dans affichage et DATA");
    String result = f.render("DATA/WebHome.xwiki", "create", "acronym", "IMPORT", "label", "Libellé", "definition", "Définition", "type", "commun", "proprietaire", "Inconnu");
    check(result.equals("ERREUR_AUTEUR_DROITS") && f.wiki.docs.isEmpty(), "import refuse un auteur hors groupes sans créer de fiche");
    f.wiki.profile("AdeleMartin", "Adèle", "Martin");
    result = f.render("DATA/WebHome.xwiki", "create", "proprietaire", "AdeleMartin");
    check(result.equals("ERREUR_AUTEUR_DROITS"), "un profil existant sans écriture commune est refusé");
    f.groups.addMembers("XWiki.IVQ_Gestionnaires", "XWiki.AdeleMartin");
    result = f.render("DATA/WebHome.xwiki", "create", "proprietaire", "AdeleMartin");
    check(result.startsWith("GLOSSAIRE_OK|") && savedDoc(f, result).obj.getValue("proprietaire").equals("AdeleMartin"), "membre d'un groupe d'écriture commune accepté à l'import");
    f = new Fixture(); f.groups.manager = true; Doc source = common(f);
    result = f.render("DATA/WebHome.xwiki", "save", "targetRef", source.getFullName(), "acronym", "COMMUN", "label", "Libellé", "definition", "Définition", "type", "commun", "proprietaire", "Inconnu");
    check(result.equals("ERREUR_AUTEUR_DROITS") && f.refactoring.calls == 0 && source.obj.getValue("proprietaire").equals("Test"), "édition refuse un auteur hors groupes sans déplacer la fiche");
    f.wiki.profile("AdeleMartin", "Adèle", "Martin");
    f.wiki.profile("SansNom", "", "");
    f.wiki.profile("Echappe", "<img src=x onerror=alert(1)>", "& Co");
    f.wiki.profile("Lecteur", "Simple", "Lecteur");
    f.wiki.getDocument("XWiki.PageOrdinaire").save("", false);
    f.groups.addMembers("XWiki.IVQ_Gestionnaires", "XWiki.AdeleMartin", "XWiki.SousGroupe", "XWiki.PageOrdinaire", "XWiki.Supprime");
    f.groups.addMembers("XWiki.SousGroupe", "XWiki.SansNom", "XWiki.Echappe", "XWiki.IVQ_Gestionnaires");
    String html = f.render("WebHome.xwiki", "");
    check(html.contains("value=\"AdeleMartin\"") && html.contains("Adèle Martin (AdeleMartin)"), "catalogue depuis les groupes avec noms/prénoms");
    check(html.contains("data-label=\"SansNom\"") && html.contains("&lt;img src=x onerror=alert(1)&gt;"), "sous-groupes récursifs, cycles, noms vides et noms échappés");
    check(!html.contains("value=\"PageOrdinaire\"") && !html.contains("value=\"Lecteur\"") && !html.contains("value=\"SousGroupe\"") && !html.contains("value=\"Supprime\""), "seuls les utilisateurs membres sont proposés");
    f.wiki.emptyUserQuery = true;
    check(f.render("WebHome.xwiki", "").contains("data-reverse-label=\"Martin Adèle\""), "aucune dépendance à la requête globale des profils");
    result = f.render("DATA/WebHome.xwiki", "listAuthors");
    check(result.contains("LIEN_AUTHOR|AdeleMartin|Ad%C3%A8le+Martin|Martin+Ad%C3%A8le|") && result.endsWith("LIENS_AUTHORS_OK"), "DATA fournit le même catalogue encodé à l'éditeur et à l'import");
    check(!result.contains("LIEN_AUTHOR|Lecteur|") && !result.contains("LIEN_AUTHOR|SousGroupe|"), "service exclut lecteurs et groupes");
    f.groups.members.get(new Ref("XWiki", "IVQ_Gestionnaires")).remove(new Ref("XWiki", "AdeleMartin"));
    result = f.render("DATA/WebHome.xwiki", "create", "acronym", "RETIRE", "proprietaire", "AdeleMartin");
    check(result.equals("ERREUR_AUTEUR_DROITS"), "membre retiré après aperçu refusé à l'enregistrement");
    result = f.render("DATA/WebHome.xwiki", "save", "targetRef", "TestPage.PAGE.Liens.DATA.LIENDATA.Test.COMMUN", "acronym", "COMMUN", "proprietaire", "Test");
    check(result.startsWith("GLOSSAIRE_OK|"), "le membre connecté conserve un auteur valide pour l'édition");
    f.groups.addMembers("XWiki.IVQ_Gestionnaires", "XWiki.AdeleMartin");
    f.wiki.profiles.remove(new Ref("XWiki", "AdeleMartin"));
    check(f.render("DATA/WebHome.xwiki", "create", "proprietaire", "AdeleMartin").equals("ERREUR_AUTEUR_DROITS"), "membre supprimé exclu même s'il reste dans le groupe");
    f = new Fixture();
    check(f.render("DATA/WebHome.xwiki", "listAuthors").equals("ERREUR_DROITS"), "catalogue réservé à l'écriture commune");
    check(!f.render("WebHome.xwiki", "").contains("id=\"liensAuthorOptions\""), "pas de catalogue sans écriture commune");
    f = new Fixture(); configure(f, 0, 2); f.wiki.profile("Implicite", "Compte", "Implicite");
    check(f.render("DATA/WebHome.xwiki", "listAuthors").contains("LIEN_AUTHOR|Implicite|"), "AllGroup implicite inclut tous les profils du wiki");
    f = new Fixture(); Doc configuration = configure(f, 0, 0);
    configuration.obj.set("commonWriteGroups", "XWiki.Redacteurs\nautre:XWiki.Equipe");
    configuration.obj.set("commonReadGroups", "XWiki.Lecteurs");
    f.groups.memberships.add(new Ref("XWiki", "Redacteurs"));
    f.wiki.profile("DeuxGroupes", "Deux", "Groupes"); f.wiki.profile("LectureSeule", "Lecture", "Seule");
    f.groups.addMembers("XWiki.Redacteurs", "XWiki.DeuxGroupes");
    f.groups.addMembers("autre:XWiki.Equipe", "XWiki.DeuxGroupes", "XWiki.Autre");
    f.groups.addMembers("XWiki.Lecteurs", "XWiki.LectureSeule");
    result = f.render("DATA/WebHome.xwiki", "listAuthors");
    check(result.contains("LIEN_AUTHOR|DeuxGroupes|") && result.contains("LIEN_AUTHOR|Autre|") && !result.contains("LIEN_AUTHOR|LectureSeule|"), "union des groupes autorisés, y compris groupe d'un autre wiki");
    check(result.indexOf("LIEN_AUTHOR|DeuxGroupes|") == result.lastIndexOf("LIEN_AUTHOR|DeuxGroupes|"), "membre de plusieurs groupes sans doublon");
    Doc foreign = f.wiki.getDocument("autre:XWiki.Auteur"); foreign.newObject("XWiki.XWikiUsers");
    foreign.obj.set("first_name", "Auteur"); foreign.obj.set("last_name", "Global"); foreign.save("", false);
    f.groups.addMembers("autre:XWiki.Equipe", "autre:XWiki.Auteur");
    result = f.render("DATA/WebHome.xwiki", "listAuthors");
    check(result.contains("LIEN_AUTHOR|Auteur|Auteur+Global|") && result.contains("|autre%3AXWiki.Auteur"), "identifiant court et référence qualifiée conservés séparément");
    f.userContext.user = "autre:XWiki.Auteur";
    check(f.render("DATA/WebHome.xwiki", "listAuthors").contains("LIEN_AUTHOR|Auteur|Auteur+Global|"), "même identifiant court pour soi et pour les autres membres");
    f.userContext.user = "XWiki.Test";
    result = f.render("DATA/WebHome.xwiki", "create", "acronym", "GLOBAL", "label", "Libellé", "definition", "Définition", "type", "commun", "proprietaire", "autre:XWiki.Auteur");
    check(result.startsWith("GLOSSAIRE_OK|"), "création avec un membre qualifié d'un autre wiki");
    check(savedDoc(f, result).obj.getValue("proprietaire").equals("Auteur"), "référence qualifiée jamais utilisée comme dossier ou propriétaire");
    f.wiki.profile("NonMembre", "Ancien", "Auteur");
    Doc legacy = f.wiki.getDocument(new Ref("TestPage.PAGE.Liens.DATA.LIENDATA.NonMembre", "HISTORIQUE"));
    legacy.newObject("TestPage.PAGE.Liens.CODE.lienClass.WebHome"); legacy.obj.set("proprietaire", "NonMembre"); legacy.obj.set("type", "commun"); legacy.save("", false);
    result = f.render("DATA/WebHome.xwiki", "save", "targetRef", legacy.getFullName(), "acronym", "HISTORIQUE", "proprietaire", "NonMembre");
    check(result.equals("ERREUR_AUTEUR_DROITS") && f.refactoring.calls == 0, "ancien auteur non membre refusé même si l'identifiant ne change pas");
    f.request.method = "GET";
    check(f.render("DATA/WebHome.xwiki", "listAuthors").equals("ERREUR_METHOD"), "catalogue vérifie POST");
    f.request.method = "POST"; f.request.params.put("form_token", "bad");
    check(f.render("DATA/WebHome.xwiki", "listAuthors").equals("ERREUR_CSRF"), "catalogue vérifie CSRF");
  }
  static Doc oldOwnerLink(Fixture f, String owner, String name, String type) {
    Doc d = f.wiki.getDocument(new Ref("TestPage.PAGE.Liens.DATA.LIENDATA." + owner, name));
    d.newObject("TestPage.PAGE.Liens.CODE.lienClass.WebHome");
    d.obj.set("proprietaire", owner); d.obj.set("type", type); d.obj.set("nom_lien", name);
    d.obj.set("lien", "Libellé " + name); d.obj.set("definition", "Définition"); d.save("", false); return d;
  }
  static Doc savedDoc(Fixture f, String result) {
    return f.wiki.getDocument(java.net.URLDecoder.decode(result.split("\\|", -1)[1], StandardCharsets.UTF_8));
  }
  static void ownerIdTests() throws Exception {
    for (String owner : List.of("Autre", "XWiki.Autre", "xwiki:XWiki.Autre")) {
      Fixture f = new Fixture(); f.groups.manager = true;
      String result = f.render("DATA/WebHome.xwiki", "create", "acronym", "IMPORT", "label", "Libellé", "definition", "Définition", "type", "commun", "proprietaire", owner);
      check(result.startsWith("GLOSSAIRE_OK|"), "création accepte l'alias " + owner);
      Doc saved = savedDoc(f, result);
      check(!saved.isNew() && saved.obj.getValue("proprietaire").equals("Autre"), "propriétaire court enregistré pour " + owner);
      check(f.wiki.docs.size() == 1 && saved.ref.parent.endsWith(".Autre"), "un seul dossier userid pour " + owner);
    }
    Fixture f = new Fixture();
    String result = f.render("DATA/WebHome.xwiki", "create", "acronym", "PERSO", "label", "Libellé", "definition", "Définition", "type", "personnel", "proprietaire", "xwiki:XWiki.Test");
    check(result.startsWith("GLOSSAIRE_OK|") && savedDoc(f, result).obj.getValue("proprietaire").equals("Test"), "alias du compte connecté normalisé avec écriture personnelle seule");
    f = new Fixture(); f.groups.manager = true;
    result = f.render("DATA/WebHome.xwiki", "create", "acronym", "FORGE", "label", "Libellé", "definition", "Définition", "type", "commun", "proprietaire", "autre:XWiki.Autre");
    check(result.equals("ERREUR_AUTEUR_DROITS") && f.wiki.docs.isEmpty(), "une référence d'un autre wiki ne contourne pas la liste des membres");
    f = new Fixture(); f.groups.manager = true; f.wiki.profile("Jean.Dupont", "Jean", "Dupont");
    f.groups.addMembers("XWiki.IVQ_Gestionnaires", "XWiki.Jean\\.Dupont");
    result = f.render("DATA/WebHome.xwiki", "create", "acronym", "POINT", "label", "Libellé", "definition", "Définition", "type", "commun", "proprietaire", "Jean.Dupont");
    check(result.startsWith("GLOSSAIRE_OK|") && f.wiki.docs.values().iterator().next().obj.getValue("proprietaire").equals("Jean.Dupont"), "un point dans l'identifiant est conservé");
    f = new Fixture(); f.groups.manager = true;
    Doc legacy = oldOwnerLink(f, "xwiki:XWiki.Autre", "ANCIEN", "commun");
    result = f.render("DATA/WebHome.xwiki", "save", "targetRef", legacy.getFullName(), "acronym", "ANCIEN", "label", "Libellé", "definition", "Définition", "type", "commun", "proprietaire", "xwiki:XWiki.Autre");
    check(result.startsWith("GLOSSAIRE_OK|") && legacy.isNew(), "ancien dossier qualifié déplacé lors de l'enregistrement");
    check(f.wiki.docs.size() == 1 && savedDoc(f, result).obj.getValue("proprietaire").equals("Autre"), "déplacement conserve une seule fiche sous userid");
    f = new Fixture();
    legacy = oldOwnerLink(f, "xwiki:XWiki.Test", "RAWMINE", "personnel");
    oldOwnerLink(f, "xwiki:XWiki.Autre", "RAWSECRET", "personnel");
    oldOwnerLink(f, "autre:XWiki.Test", "HOMONYME", "personnel");
    String html = f.render("WebHome.xwiki", "");
    check(html.contains("RAWMINE") && !html.contains("RAWSECRET") && !html.contains("HOMONYME"), "anciens personnels visibles uniquement pour le propriétaire exact");
    result = f.render("DATA/WebHome.xwiki", "listVisible");
    check(result.contains("|RAWMINE|") && result.contains("|personnel|Test") && !result.contains("RAWSECRET") && !result.contains("HOMONYME"), "liste visible normalise l'auteur personnel sans ouvrir les autres comptes");
    result = f.render("DATA/WebHome.xwiki", "save", "targetRef", legacy.getFullName(), "acronym", "RAWMINE", "label", "Libellé", "definition", "Définition", "type", "personnel", "proprietaire", "xwiki:XWiki.Test");
    check(result.startsWith("GLOSSAIRE_OK|") && legacy.isNew() && !savedDoc(f, result).isNew() && savedDoc(f, result).ref.parent.equals(SPACE), "ancien personnel corrigé dans userid à la prochaine modification");
    f = new Fixture(); legacy = oldOwnerLink(f, "xwiki:XWiki.Test", "SUPPRIMER", "personnel");
    check(f.delete(legacy.getFullName()).equals("GLOSSAIRE_OK") && legacy.isNew(), "suppression d'un ancien personnel qualifié reste possible");
  }
  static void stableAddressTests() throws Exception {
    String homeSource = Files.readString(ROOT.resolve("Lien-test/WebHome.xwiki"));
    String dataSource = Files.readString(ROOT.resolve("Liens/DATA/WebHome.xwiki"));
    String begin = "## BEGIN LIENS ADDRESSES", end = "## END LIENS ADDRESSES";
    check(homeSource.substring(homeSource.indexOf(begin), homeSource.indexOf(end)).equals(dataSource.substring(dataSource.indexOf(begin), dataSource.indexOf(end))), "même gestion des adresses en création manuelle et DATA");
    Fixture f = new Fixture();
    String result = f.render("DATA/WebHome.xwiki", "create", "acronym", "SITE", "label", "https://example.org/path?q=test", "definition", "Description");
    check(result.startsWith("GLOSSAIRE_OK|"), "création DATA avec adresse automatique");
    Doc first = savedDoc(f, result);
    Ref firstRef = first.ref;
    check(first.ref.name.matches("[A-Za-z0-9]{16}") && first.ref.parent.equals(SPACE), "format de 16 caractères du Glossaire sous le userid");
    check(first.title.equals("SITE") && first.obj.getValue("nom_lien").equals("SITE") && first.obj.getValue("lien").equals("https://example.org/path?q=test"), "titre, acronyme et URL cible conservés indépendamment de l'adresse de la fiche");
    result = f.render("DATA/WebHome.xwiki", "create");
    Doc second = savedDoc(f, result);
    check(!first.ref.equals(second.ref) && f.wiki.docs.size() == 2, "deux créations avec le même acronyme ont deux adresses distinctes");
    result = f.save(first.getFullName(), "NOM MODIFIÉ");
    check(result.startsWith("GLOSSAIRE_OK|") && savedDoc(f, result).ref.equals(firstRef) && f.refactoring.calls == 0, "modifier l'acronyme ne renomme plus une fiche stable");
    check(first.title.equals("NOM MODIFIÉ") && first.obj.getValue("nom_lien").equals("NOM MODIFIÉ"), "titre et acronyme mis à jour sur la même fiche");
    f.groups.manager = true;
    result = f.render("DATA/WebHome.xwiki", "save", "targetRef", first.getFullName(), "acronym", "AUTRE AUTEUR", "type", "commun", "proprietaire", "Autre");
    Doc moved = savedDoc(f, result);
    check(result.startsWith("GLOSSAIRE_OK|") && moved.ref.name.equals(firstRef.name) && moved.ref.parent.endsWith(".Autre") && first.isNew(), "changer l'auteur conserve l'identifiant et déplace sous son userid");
    result = f.render("DATA/WebHome.xwiki", "save", "targetRef", moved.getFullName(), "acronym", "ENCORE MODIFIÉ");
    check(result.startsWith("GLOSSAIRE_OK|") && savedDoc(f, result).ref.equals(moved.ref) && f.refactoring.calls == 1, "l'adresse reste stable après un déplacement");

    f = new Fixture(); Doc legacy = f.wiki.add("ANCIEN", "ANCIEN"); legacy.content = "Contenu existant";
    result = f.save(legacy.getFullName(), "NOUVEAU"); Doc converted = savedDoc(f, result);
    check(legacy.isNew() && converted.ref.name.matches("[A-Za-z0-9]{16}") && f.wiki.docs.size() == 1, "ancienne adresse convertie au premier enregistrement sans doublon");
    check(converted.content.startsWith("Contenu existant") && converted.title.equals("NOUVEAU"), "conversion conserve le contenu et met à jour le titre");
    result = f.save(converted.getFullName(), "APRÈS CONVERSION");
    check(savedDoc(f, result).ref.equals(converted.ref) && f.refactoring.calls == 1, "une ancienne fiche ne se convertit qu'une seule fois");

    f = new Fixture();
    Doc occupied = f.wiki.add("abcdefghijklmnop", "OCCUPÉ");
    Doc nested = f.wiki.getDocument(new Ref(SPACE + ".ponmlkjihgfedcba", "WebHome")); nested.save("", false);
    f.wiki.pageNames.addAll(List.of("abcdefghijklmnop", "ponmlkjihgfedcba", "qrstuvwxyzABCDEF"));
    result = f.render("DATA/WebHome.xwiki", "create", "acronym", "SITE", "label", "https://example.org", "definition", "Description");
    check(result.startsWith("GLOSSAIRE_OK|") && savedDoc(f, result).ref.name.equals("qrstuvwxyzABCDEF") && f.wiki.docs.size() == 3 && occupied.saves == 1 && nested.saves == 1, "collisions terminales et imbriquées évitées sans écrasement");
    f = new Fixture();
    f.wiki.pageNames.addAll(List.of("nom/invalide", "WebHome", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnop"));
    result = f.render("DATA/WebHome.xwiki", "create", "acronym", "SITE", "label", "https://example.org", "definition", "Description");
    check(result.startsWith("GLOSSAIRE_OK|") && savedDoc(f, result).ref.name.equals("abcdefghijklmnop"), "seul un identifiant de 16 caractères alphanumériques est accepté");

    f = new Fixture();
    f.render("WebHome.xwiki", "checkAndCreate", "acronyme", "MANUEL", "libelle", "https://example.org", "definition", "Description", "type", "personnel");
    first = f.wiki.docs.values().iterator().next();
    check(first.ref.name.matches("[A-Za-z0-9]{16}") && first.title.equals("MANUEL") && first.obj.getValue("lien").equals("https://example.org"), "création manuelle avec identifiant automatique et titre lisible");
    f.render("WebHome.xwiki", "checkAndCreate");
    check(f.wiki.docs.size() == 2 && "warning".equals(f.request.session.getAttribute("liens_status")), "création manuelle en double : adresse distincte et notification conservée");
    result = f.save(first.getFullName(), "MODIFIÉ");
    check(savedDoc(f, result).ref.equals(first.ref) && f.refactoring.calls == 0, "adresse créée manuellement stable en édition");

    f = new Fixture();
    result = f.render("DATA/WebHome.xwiki", "create", "acronym", "SITE", "label", "https://example.org", "definition", "Description");
    first = savedDoc(f, result); f.groups.manager = true;
    Doc conflict = f.wiki.getDocument(new Ref("TestPage.PAGE.Liens.DATA.LIENDATA.Autre", first.ref.name)); conflict.save("", false);
    result = f.render("DATA/WebHome.xwiki", "save", "targetRef", first.getFullName(), "acronym", "SITE", "proprietaire", "Autre");
    check(result.equals("ERREUR_NOM_INDISPONIBLE") && !first.isNew() && conflict.saves == 1 && f.refactoring.calls == 0, "déplacement stable refusé en cas de collision sans écraser ni modifier l'identifiant");
  }
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
      check(f.save(source.getFullName(), "NOUVEAU").equals("ERREUR_DEPLACEMENT"), "renommage échoué : " + failure);
    }
    for (String failure : List.of("null", "noop")) {
      f = new Fixture(); source = f.wiki.add("API", "API"); f.refactoring.failure = failure;
      check(f.delete(source.getFullName()).equals("ERREUR_SUPPRESSION") && !source.isNew(), "suppression échouée : " + failure);
    }
    f = new Fixture(); source = f.wiki.add("API", "API"); Doc occupied = f.wiki.add("NOUVEAU", "NOUVEAU");
    result = f.save(source.getFullName(), "NOUVEAU");
    check(result.startsWith("GLOSSAIRE_OK|") && savedDoc(f, result).ref.name.matches("[A-Za-z0-9]{16}") && !occupied.isNew(), "acronyme en double conservé sous une adresse distincte");
    f = new Fixture(); source = f.wiki.add("A.B", "A.B");
    check(f.save(source.getFullName(), "C|D\" E").startsWith("GLOSSAIRE_OK|") && source.isNew(), "caractères spéciaux");
    f = new Fixture(); source = f.wiki.add("API", "API"); f.request.method = "GET";
    check(f.delete(source.getFullName()).equals("ERREUR_METHOD") && !source.isNew(), "GET sans mutation");
    f.request.method = "POST"; f.request.params.put("form_token", "bad");
    check(f.delete(source.getFullName()).equals("ERREUR_CSRF"), "CSRF refusé");
    f = new Fixture(); source = f.wiki.add("API", "API"); f.wiki.allowed = false;
    check(f.save(source.getFullName(), "NOUVEAU").equals("ERREUR_DROITS") && f.refactoring.calls == 0, "droits refusés");
    f = new Fixture(); source = f.wiki.add("API", "API"); source.obj.set("proprietaire", "Autre");
    check(f.delete(source.getFullName()).equals("ERREUR_REFERENCE"), "référence hors espace propriétaire");
    f = new Fixture(); source = f.wiki.add("API", "API"); source.obj.set("type", "commun");
    check(f.delete(source.getFullName()).equals("ERREUR_DROITS"), "commun réservé aux managers");
    f.groups.manager = true;
    check(f.save(source.getFullName(), "NOUVEAU").startsWith("GLOSSAIRE_OK"), "manager peut modifier le commun");
    f = new Fixture(); source = f.wiki.add("API", "API"); f.groups.manager = true;
    result = f.render("DATA/WebHome.xwiki", "save", "targetRef", source.getFullName(), "acronym", "NOUVEAU", "label", "Libellé", "definition", "Définition", "type", "commun", "proprietaire", "Autre");
    check(result.startsWith("GLOSSAIRE_OK|") && source.isNew() && f.wiki.docs.keySet().iterator().next().parent.endsWith(".Autre"), "auteur et nom modifiés en une opération");
    f = new Fixture();
    for (String invalid : List.of("", "   ", "A/B")) {
      result = f.render("DATA/WebHome.xwiki", "create", "acronym", invalid, "label", "Interface", "definition", "Définition");
      check(!result.startsWith("GLOSSAIRE_OK") && f.wiki.docs.isEmpty(), "création invalide : " + invalid);
    }
    f = new Fixture();
    for (int i = 1; i <= 100; i++) f.wiki.add(String.format("%016x", i), "API");
    result = f.render("DATA/WebHome.xwiki", "create", "acronym", "API", "label", "Interface", "definition", "Définition");
    check(result.equals("ERREUR_NOM_INDISPONIBLE") && f.wiki.docs.size() == 100, "épuisement des noms : " + result);
    f = new Fixture();
    String html = f.render("WebHome.xwiki", "checkAndCreate", "acronyme", "API", "libelle", "Interface", "definition", "Définition", "type", "personnel");
    check(f.wiki.docs.size() == 1, "création manuelle valide");
    f = new Fixture(); f.request.method = "GET";
    html = f.render("WebHome.xwiki", "checkAndCreate", "acronyme", "API", "libelle", "Interface", "definition", "Définition", "type", "personnel");
    check(f.wiki.docs.isEmpty() && html.contains("alert-danger"), "création manuelle GET refusée");
    f.request.method = "POST"; f.request.params.put("form_token", "bad");
    html = f.render("WebHome.xwiki", "checkAndCreate");
    check(f.wiki.docs.isEmpty() && html.contains("alert-danger"), "création manuelle CSRF refusée");
    f = new Fixture();
    html = f.render("WebHome.xwiki", "checkAndCreate", "acronyme", "API", "libelle", "Interface", "definition", "Définition", "type", "commun");
    check(f.wiki.docs.isEmpty() && html.contains("alert-danger"), "création manuelle commun refusée");
    f = new Fixture(); source = f.wiki.add("A.B", "A.B"); source.obj.set("lien", "<img src=x onerror=alert(1)>"); source.obj.set("definition", "</textarea><script>alert(1)</script>");
    Doc hidden = f.wiki.add("PRIVE", "PRIVE"); hidden.obj.set("proprietaire", "Autre");
    html = f.render("WebHome.xwiki", "");
    check(html.contains("&lt;img") && !html.contains("<script>alert") && !html.contains("PRIVE"), "affichage échappé et popup privée");
    result = f.render("DATA/WebHome.xwiki", "listVisible");
    check(result.contains("%3Cimg") && !result.contains("PRIVE") && result.contains("LIEN_LIST_OK|Test|false"), "liste encodée et privée");
    f = new Fixture(); f.groups.manager = true;
    f.wiki.profile("AdeleMartin", "Adèle", "Martin"); f.wiki.profile("ZoeDurand", "Zoé", "Durand"); f.wiki.profile("Login42", "Jean", "Dupont");
    f.wiki.profile("NonAuteur", "Membre", "Lecture");
    f.groups.addMembers("XWiki.IVQ_Gestionnaires", "XWiki.AdeleMartin", "XWiki.ZoeDurand", "XWiki.Login42");
    for (int i = 0; i < 27; i++) {
      Doc row = f.wiki.add(String.format("A%02d", i), String.format("A%02d", i));
      row.obj.set("lien", i % 2 == 0 ? "Groupe pair" : "Groupe impair"); row.obj.set("definition", "Définition " + i);
    }
    for (int i = 0; i < 17; i++) { Doc row = f.wiki.add(String.format("C%02d", i), String.format("C%02d", i)); row.obj.set("type", "commun"); }
    if (args.length > 0) {
      Files.writeString(Path.of(args[0]), f.render("WebHome.xwiki", ""));
      Files.writeString(Path.of(args[0] + ".authors.txt"), f.render("DATA/WebHome.xwiki", "listAuthors"));
    }
    permissionsTests(args.length > 0 ? args[0] : null);
    authorTests();
    ownerIdTests();
    stableAddressTests();
    System.out.println(checks + " vérifications Velocity réussies.");
  }
}
