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
  static final String DATA_DOC = SPACE + ".WebHome";
  static final String DATA_URL = "https://wiki.test/bin/view/TestPage/PAGE/Glossaire/DATA/WebHome";
  static final String PROPOSAL_SPACE = "TestPage.PAGE.Glossaire.PROPOSITIONS";
  static final String TRASH_SPACE = "TestPage.PAGE.Glossaire.CORBEILLE";
  static final long WEEK = 604800000L;
  static final String RIGHTS_CLASS = "XWiki.XWikiRights";
  static final String GROUP_CLASS = "XWiki.XWikiGroups";
  static final String CLASS = "TestPage.PAGE.Glossaire.CODE.glossaireClass.WebHome";
  static final String PROPOSAL_CLASS = "TestPage.PAGE.Glossaire.CODE.glossairePropositionClass.WebHome";
  static final String CONFIG_CLASS = "TestPage.PAGE.Glossaire.CODE.glossaireConfigurationClass.WebHome";
  static final String CONFIG_DOC = "TestPage.PAGE.Glossaire.CODE.Configuration.WebHome";
  static final Path ROOT = Path.of("xwiki/TestPage/PAGE/Glossaire");
  static final List<String> SPACES = List.of("TestPage", "PAGE", "Glossaire", "DATA");
  static final VelocityEngine ENGINE = new VelocityEngine();
  static int checks;

  public static class Ref {
    final String wiki, parent, name;
    Ref(String parent, String name) { this("xwiki", parent, name); }
    Ref(String wiki, String parent, String name) { this.wiki = wiki; this.parent = parent; this.name = name; }
    public ParentRef getParent() { return new ParentRef(wiki, parent); }
    public WikiRef getWikiReference() { return new WikiRef(wiki); }
    public String getName() { return name; }
    public String toString() { return (wiki.equals("xwiki") ? "" : wiki + ":") + parent + "." + name.replace("\\", "\\\\").replace(".", "\\."); }
    public boolean equals(Object other) { return other instanceof Ref r && wiki.equals(r.wiki) && parent.equals(r.parent) && name.equals(r.name); }
    public int hashCode() { return Objects.hash(wiki, parent, name); }
  }
  public record ParentRef(String wiki, String parent) {}
  public static class WikiRef {
    final String name;
    WikiRef(String name) { this.name = name; }
    public String getName() { return name; }
    public String toString() { return name; }
  }
  public static class Model {
    final boolean absolute;
    Model() { this(false); }
    Model(boolean absolute) { this.absolute = absolute; }
    public Ref createDocumentReference(String wiki, List<String> spaces, String name) { return new Ref(wiki == null || wiki.isEmpty() ? "xwiki" : wiki, String.join(".", spaces), name); }
    public Ref resolveDocument(String text) {
      String wiki = "xwiki";
      int colon = text.indexOf(':');
      if (colon >= 0) { wiki = text.substring(0, colon); text = text.substring(colon + 1); }
      int cut = -1;
      boolean escaped = false;
      for (int i = 0; i < text.length(); i++) {
        char c = text.charAt(i);
        if (!escaped && c == '.') cut = i;
        if (!escaped && c == '\\') escaped = true; else escaped = false;
      }
      String name = text.substring(cut + 1).replace("\\.", ".").replace("\\\\", "\\");
      return new Ref(wiki, cut < 0 ? SPACE : text.substring(0, cut), name);
    }
    public String serialize(Ref ref) { return absolute && ref.wiki.equals("xwiki") ? "xwiki:" + ref.toString() : ref.toString(); }
    public String serialize(Ref ref, String hint) { return serialize(ref); }
  }
  public static class Obj {
    final Map<String, Object> values = new HashMap<>();
    final Set<String> ignoredFields;
    Obj() { this(Set.of()); }
    Obj(Set<String> ignoredFields) { this.ignoredFields = new HashSet<>(ignoredFields); }
    public Object getValue(String key) { return values.getOrDefault(key, ""); }
    public void set(String key, Object value) { if (!ignoredFields.contains(key)) values.put(key, value); }
  }
  public static class Doc {
    final Wiki wiki; final Ref ref; Ref contentAuthor; Obj obj; String title = "", content = ""; int revision;
    final Map<String, Obj> objects = new HashMap<>();
    final Map<String, List<Obj>> objectLists = new HashMap<>();
    Doc(Wiki wiki, Ref ref) { this.wiki = wiki; this.ref = ref; this.contentAuthor = wiki.scriptAuthor; }
    public boolean isNew() { return !wiki.docs.containsKey(ref); }
    public Obj getObject(String className) { return objects.get(className); }
    public Obj newObject(String className) {
      obj = new Obj(wiki.ignoredFields.getOrDefault(className, Set.of())); objectLists.computeIfAbsent(className, ignored -> new ArrayList<>()).add(obj);
      objects.putIfAbsent(className, obj); return obj;
    }
    public List<Obj> getObjects(String className) { return new ArrayList<>(objectLists.getOrDefault(className, List.of())); }
    public boolean removeObject(Obj removed) {
      for (String className : new ArrayList<>(objectLists.keySet())) {
        List<Obj> values = objectLists.get(className);
        if (values.remove(removed)) { if (values.isEmpty()) objects.remove(className); else objects.put(className, values.get(0)); return true; }
      }
      return false;
    }
    public Ref getContentAuthorReference() { return contentAuthor; }
    public String getContentAuthor() { return contentAuthor.toString(); }
    public void deleteAsAuthor() {
      if (!wiki.authorAllowed) throw new IllegalStateException("Script author lacks delete right");
      wiki.authorDeletes.add(ref);
      if (!wiki.failedDeletes.contains(ref)) wiki.docs.remove(ref);
    }
    public String getFullName() { return ref.toString(); }
    public String getName() { return ref.name; }
    public String getTitle() { return title; }
    public String getURL() { return "/glossaire"; }
    public Ref getDocumentReference() { return ref; }
    public String getVersion() { return revision + ".1"; }
    public String getContent() { return content; }
    public void setContent(String value) { content = value; }
    public void setTitle(String value) { title = value; }
    public void save(String message, boolean minor) {
      if (!wiki.allowed) throw new IllegalStateException("Caller lacks native edit right");
      wiki.normalSaves++; persist();
    }
    public void saveAsAuthor(String message, boolean minor) {
      if (!wiki.authorAllowed) throw new IllegalStateException("Script author lacks edit right");
      wiki.authorSaves++; persist();
    }
    private void persist() { revision++; wiki.docs.put(ref, this); }
  }
  public static class Extension {
    final List<String> requested = new ArrayList<>();
    public void use(String name) { requested.add(name); }
  }
  public static class Wiki {
    final Map<Ref, Doc> docs = new LinkedHashMap<>();
    final Map<String, Set<String>> ignoredFields = new HashMap<>();
    final List<Ref> authorReads = new ArrayList<>();
    final Extension jsx = new Extension(), ssx = new Extension();
    boolean allowed = true, visible = true, authorAllowed = true, admin, absoluteReferences; int normalSaves, authorSaves, uniqueId;
    final Ref scriptAuthor = new Ref("XWiki", "ScriptAuthor");
    final List<Ref> authorDeletes = new ArrayList<>();
    final Set<Ref> failedDeletes = new HashSet<>();
    final Set<Ref> deniedAuthorReads = new HashSet<>();
    final Deque<String> forcedNames = new ArrayDeque<>();
    public boolean hasWikiAdminRights() { return admin; }
    public Extension getJsx() { return jsx; }
    public Extension getSsx() { return ssx; }
    public Doc getDocument(Object ref) {
      Ref reference = ref instanceof Ref r ? r : new Model().resolveDocument(String.valueOf(ref));
      return docs.getOrDefault(reference, new Doc(this, reference));
    }
    public Doc getDocumentAsAuthor(Object value) { Ref ref = value instanceof Ref r ? r : new Model().resolveDocument(String.valueOf(value)); authorReads.add(ref); return authorAllowed && !deniedAuthorReads.contains(ref) ? getDocument(ref) : null; }
    public String getUniquePageName(String space) { return forcedNames.isEmpty() ? String.format("%016d", ++uniqueId) : forcedNames.removeFirst(); }
    public String getURL(String reference, String action) { return "https://wiki.test/bin/" + action + "/" + reference.replace(".", "/"); }
    public boolean hasAccessLevel(String right, String user, String reference) {
      if (right.equals("admin")) return admin;
      if (right.equals("view")) return visible;
      return user.equals(scriptAuthor.toString()) ? authorAllowed : allowed;
    }
    public List<String> getSpaceDocsName(String space) {
      return docs.keySet().stream().filter(r -> r.parent.equals(space)).map(r -> r.name).toList();
    }
    Doc add(String name, String acronym) {
      Doc d = getDocument(new Ref(SPACE, name)); d.newObject(CLASS);
      d.obj.set("acronyme", acronym); d.obj.set("libelle", "Libellé " + acronym); d.obj.set("definition", "Définition");
      d.save("", false); return d;
    }
    Doc addProposal(String name, String acronym, String status, String author, String comment) {
      Doc d = getDocument(new Ref(PROPOSAL_SPACE, name)); Obj o = d.newObject(PROPOSAL_CLASS);
      o.set("acronyme", acronym); o.set("libelle", "Libellé " + acronym); o.set("definition", "Définition " + acronym);
      o.set("status", status); o.set("author", author); o.set("reviewComment", comment);
      o.set("submittedAt", new DateTool().getDate()); o.set("reviewer", ""); o.set("publishedRef", "");
      d.setTitle(acronym); d.saveAsAuthor("Fixture", true); return d;
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
    Ref user = new Ref("XWiki", "Test");
    public String getUser() { return user == null ? "XWiki.XWikiGuest" : user.toString(); }
    public Ref getUserReference() { return user; }
    public void setFinished(boolean value) {}
  }
  public static class Group {
    final Set<Ref> memberships = new HashSet<>(Set.of(new Ref("XWiki", "GlossaireValidateurs")));
    final Map<Ref, Set<Ref>> byUser = new HashMap<>();
    public Collection<Ref> getGroups(Ref user, Object wiki, boolean recursive) {
      if (!recursive || !(wiki instanceof WikiRef)) throw new IllegalArgumentException("Recursive group lookup must use wiki reference");
      return byUser.getOrDefault(user, memberships).stream().filter(ref -> ref.wiki.equals(((WikiRef) wiki).name)).toList();
    }
  }
  public static class UserServices {
    final Group group = new Group();
    public Group getGroup() { return group; }
  }
  public static class DateTool {
    long now = 1791979200000L;
    public Date getDate() { return new Date(now); }
    public Date toDate(String format, String value) { return new Date(Long.parseLong(value)); }
    public Date toDate(long value) { return new Date(value); }
  }
  public static class Queries {
    final Wiki wiki;
    Queries(Wiki wiki) { this.wiki = wiki; }
    public Queries hql(String query) { return this; }
    public Queries xwql(String query) { return this; }
    public Queries bindValue(String name, Object value) { return this; }
    public Queries setWiki(String wikiName) { return this; }
    public List<String> execute() { return wiki.docs.values().stream().filter(d -> d.getObject(GROUP_CLASS) != null).map(Doc::getFullName).sorted().toList(); }
  }
  public static class Escape {
    public String velocity(Object value) { return String.valueOf(value).replace("$", "${escapetool.d}").replace("#", "${escapetool.h}"); }
    public String getD() { return "$"; }
    public String getH() { return "#"; }
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
    Ref source, target, userReference; boolean checkRights = true; boolean autoRedirect = true, deep, interactive = true;
    public void setAutoRedirect(boolean value) { autoRedirect = value; }
    public void setDeep(boolean value) { deep = value; }
    public void setInteractive(boolean value) { interactive = value; }
    public void setUpdateLinks(boolean value) {}
    public void setUpdateParentField(boolean value) {}
    public void setCheckRights(boolean value) { checkRights = value; }
    public void setUserReference(Ref value) { userReference = value; }
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
        dest.obj = source.obj; dest.objects.putAll(source.objects); dest.content = source.content; dest.title = source.title; dest.contentAuthor = source.contentAuthor; dest.save("", false);
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
    final Context userContext = new Context(); final UserServices userServices = new UserServices();
    final DateTool clock = new DateTool();
    Fixture() { request.params.put("form_token", "test-token"); }
    String render(String filename, String action, String... pairs) throws Exception {
      request.params.put("action", action);
      for (int i = 0; i < pairs.length; i += 2) request.params.put(pairs[i], pairs[i + 1]);
      Response response = new Response(); VelocityContext context = new VelocityContext();
      context.put("xwiki", wiki); context.put("request", request); context.put("response", response);
      String documentName = filename.equals("DATA/WebHome.xwiki") ? DATA_DOC : "TestPage.PAGE.Glossaire.WebHome";
      context.put("doc", wiki.getDocument(documentName));
      context.put("xcontext", userContext); context.put("escapetool", new Escape()); context.put("datetool", clock);
      context.put("services", Map.of("model", new Model(wiki.absoluteReferences), "csrf", new Csrf(), "refactoring", refactoring, "icon", new Icon(), "user", userServices, "query", new Queries(wiki)));
      // XWiki evaluates all content inside the outer Velocity macro, including
      // the inner HTML macro. Preserve that full source for the Velocity parser.
      String template = velocityBody(Files.readString(ROOT.resolve(filename)));
      StringWriter output = new StringWriter(); ENGINE.evaluate(context, output, filename, template);
      return filename.equals("DATA/WebHome.xwiki") ? response.body.toString().trim()
          : output.toString().replaceAll("(?m)^\\{\\{/?html(?:[^}\\r\\n]*)}}[ \t]*(?:\\r?\\n|$)", "");
    }
    String save(String source, String acronym) throws Exception {
      return data("save", "targetRef", source, "acronym", acronym, "label", "Nouveau libellé", "definition", "Nouvelle définition");
    }
    String delete(String source) throws Exception { return data("delete", "targetRef", source); }
    void ordinary() { userServices.group.memberships.clear(); }
    void manager() { userServices.group.memberships.add(new Ref("XWiki", "GlossaireValidateurs")); }
    String data(String action, String... pairs) throws Exception { return render("DATA/WebHome.xwiki", action, pairs); }
    String create(String acronym, String label) throws Exception { return data("create", "acronym", acronym, "label", label, "definition", "Définition créée"); }
    Doc proposal() { return wiki.docs.values().stream().filter(d -> d.ref.parent.equals(PROPOSAL_SPACE)).findFirst().orElseThrow(); }
    List<Doc> proposals() { return wiki.docs.values().stream().filter(d -> d.ref.parent.equals(PROPOSAL_SPACE)).toList(); }
    String importRows(boolean acronymDuplicates, boolean labelDuplicates, String[]... rows) throws Exception {
      request.params.keySet().removeIf(key -> key.matches("(acronym|label|definition)_[0-9]+"));
      List<String> pairs = new ArrayList<>(List.of("allowAcronymDuplicates", String.valueOf(acronymDuplicates), "allowLabelDuplicates", String.valueOf(labelDuplicates)));
      for (int i = 0; i < rows.length; i++) {
        for (int field = 0; field < rows[i].length; field++) {
          pairs.add(List.of("acronym_", "label_", "definition_").get(field) + i); pairs.add(rows[i][field]);
        }
      }
      return data("import", pairs.toArray(String[]::new));
    }
    List<Doc> published() { return wiki.docs.values().stream().filter(d -> d.ref.parent.equals(SPACE) && d.getObject(CLASS) != null).toList(); }
    List<Doc> trash() { return wiki.docs.values().stream().filter(d -> d.ref.parent.equals(TRASH_SPACE) && d.getObject(PROPOSAL_CLASS) != null).toList(); }
    Doc addTrash(String name, String acronym, String status, String author, String reason, long age) {
      Doc d = wiki.getDocument(new Ref(TRASH_SPACE, name)); Obj o = d.newObject(PROPOSAL_CLASS);
      o.set("acronyme", acronym); o.set("libelle", "Libellé " + acronym); o.set("definition", "Définition " + acronym);
      o.set("status", status); o.set("author", author); o.set("reviewComment", reason); o.set("reviewer", "XWiki.Validateur");
      o.set("submittedAt", new Date(clock.now - age - 1000)); o.set("reviewedAt", new Date(clock.now - age));
      o.set("deletedAt", new Date(clock.now - age)); o.set("sourceProposalId", name); o.set("publishedRef", "");
      d.setTitle(acronym); d.saveAsAuthor("Fixture corbeille", true); return d;
    }
    Doc configure(String view, String propose, String add, String review) {
      Doc d = wiki.getDocument(CONFIG_DOC); Obj o = d.getObject(CONFIG_CLASS); if (o == null) o = d.newObject(CONFIG_CLASS);
      o.set("schemaVersion", "2"); o.set("viewGroups", view); o.set("proposeGroups", propose); o.set("directAddGroups", add); o.set("reviewGroups", review);
      d.saveAsAuthor("Fixture configuration", true); return d;
    }
    void role(int level) {
      configure("XWiki.Lecteurs", "XWiki.Contributeurs", "XWiki.Ajouteurs", "XWiki.Validateurs");
      ordinary(); if (level > 0) userServices.group.memberships.add(new Ref("XWiki", List.of("", "Lecteurs", "Contributeurs", "Ajouteurs", "Validateurs").get(level)));
    }
    Doc group(String name) { Doc d = wiki.getDocument(name); d.newObject(GROUP_CLASS); d.saveAsAuthor("Fixture groupe", true); return d; }
  }
  static String velocityBody(String source) {
    int openEnd = source.indexOf("}}"), closeStart = source.lastIndexOf("{{/velocity}}");
    if (!(source.startsWith("{{velocity}}") || source.startsWith("{{velocity ")) || openEnd < 0
        || closeStart < openEnd || !source.substring(closeStart).strip().equals("{{/velocity}}")) {
      throw new IllegalArgumentException("La page doit contenir un bloc Velocity complet");
    }
    return source.substring(openEnd + 2, closeStart);
  }
  static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
  static boolean error(String result) { return result.startsWith("GLOSSAIRE_ERROR|"); }
  static String approve(Fixture f, Doc proposal, String acronym, String label, String comment) throws Exception {
    return f.data("approve", "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(),
        "acronym", acronym, "label", label, "definition", "Définition corrigée", "comment", comment);
  }
  static void dataChecks() throws Exception {
    Fixture f = new Fixture(); Doc source = f.wiki.add("API", "API"); f.ordinary();
    check(error(f.save(source.getFullName(), "HACK")) && source.obj.getValue("acronyme").equals("API"), "proposant : modification publiée refusée");
    check(error(f.delete(source.getFullName())) && !source.isNew(), "proposant : suppression publiée refusée");
    check(error(f.create("HACK", "Interdit")) && f.published().size() == 1, "proposant : ajout direct forgé refusé");
    String result = f.importRows(false, false, new String[]{"IMPORT", "Proposition"});
    check(result.contains("ROW_PROPOSED|0|") && f.proposals().size() == 1 && f.published().size() == 1, "proposant : import sans publication directe");
    String html = f.render("WebHome.xwiki", "");
    check(!html.contains("glossary-col-actions") && !html.contains("btnReviewGlossaryProposals") && html.contains("Proposer un acronyme"), "interface proposant sans gestion publiée");
    f.manager(); html = f.render("WebHome.xwiki", "");
    check(html.contains("glossary-col-actions") && html.contains("btnReviewGlossaryProposals"), "interface validateur avec gestion et validation");

    f = new Fixture(); f.ordinary(); f.wiki.allowed = false;
    result = f.data("propose", "acronym", "A/B|${texte}", "label", "Une <proposition>", "definition", "</textarea><script>alert(1)</script>",
        "author", "XWiki.Victime", "status", "approved", "role", "4");
    Doc proposal = f.proposal(); Obj object = proposal.getObject(PROPOSAL_CLASS);
    check(result.startsWith("GLOSSAIRE_PROPOSED|") && f.published().isEmpty(), "proposition isolée malgré caractères sans rapport avec le nom technique");
    check(object.getValue("status").equals("pending") && object.getValue("author").equals("XWiki.Test") && object.getValue("submittedAt") instanceof Date,
        "auteur, état et date déterminés côté serveur");
    check(proposal.getObject(CLASS) == null && f.wiki.normalSaves == 0 && f.wiki.authorSaves == 1, "proposition écrite par auteur de confiance sans EDIT du proposant");
    html = f.render("WebHome.xwiki", "");
    check(html.contains("Une &lt;proposition&gt;") && !html.contains("<script>") && !html.contains("glossary-col-actions"), "proposition échappée hors tableau publié");
    check(error(approve(f, proposal, "API", "Interface", "")) && f.published().isEmpty(), "validation forgée refusée au proposant");
    check(error(f.data("reject", "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "comment", "Non")) && !proposal.isNew(), "refus forgé interdit au proposant");
    f.manager(); String pendingVersion = proposal.getVersion(); f.userContext.user = new Ref("XWiki", "Validateur");
    result = approve(f, proposal, "CORRIGÉ", "Libellé corrigé", "Orthographe corrigée");
    check(result.startsWith("GLOSSAIRE_APPROVED|") && f.published().size() == 1 && proposal.isNew() && f.proposals().isEmpty(), "validation publie une fiche puis retire la proposition active");
    Doc published = f.published().get(0);
    check(published.obj.getValue("acronyme").equals("CORRIGÉ") && published.obj.getValue("libelle").equals("Libellé corrigé")
        && published.obj.getValue("definition").equals("Définition corrigée"), "validation publie les champs corrigés sans droit EDIT du validateur");
    check(error(f.data("approve", "targetRef", proposal.getFullName(), "expectedVersion", pendingVersion, "acronym", "DOUBLON", "label", "Interdit"))
        && f.published().size() == 1 && published.obj.getValue("acronyme").equals("CORRIGÉ"), "validation rejouée ne crée pas de doublon ni écrasement");
    html = f.render("WebHome.xwiki", "");
    check(html.contains("CORRIGÉ") && !html.contains("glossary-proposal-card\""), "fiche validée dans tableau, absente de la liste des propositions");

    for (String denied : List.of("guest", "GET", "csrf", "author")) {
      f = new Fixture(); f.ordinary();
      if (denied.equals("guest")) f.userContext.user = null;
      if (denied.equals("GET")) f.request.method = "GET";
      if (denied.equals("csrf")) f.request.params.remove("form_token");
      if (denied.equals("author")) f.wiki.authorAllowed = false;
      check(error(f.data("propose", "acronym", "API", "label", "Interface")) && f.proposals().isEmpty(), "proposition bloquée : " + denied);
    }
    for (String action : List.of("approve", "reject", "trash")) {
      for (String denied : List.of("guest", "GET", "csrf")) {
        f = new Fixture(); proposal = f.wiki.addProposal("Interdit", "API", "pending", "XWiki.Autre", "");
        if (denied.equals("guest")) f.userContext.user = null;
        if (denied.equals("GET")) f.request.method = "GET";
        if (denied.equals("csrf")) f.request.params.put("form_token", "invalid");
        check(error(f.data(action, "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "acronym", "API", "label", "Interface", "comment", "Motif"))
            && !proposal.isNew() && f.published().isEmpty() && f.trash().isEmpty(), "décision " + action + " bloquée : " + denied);
      }
    }
    for (String invalid : List.of("", "   ", "A".repeat(256))) {
      f = new Fixture(); f.ordinary();
      check(error(f.data("propose", "acronym", invalid, "label", "Interface")) && f.proposals().isEmpty(), "proposition invalide rejetée : " + invalid.length());
    }
    f = new Fixture();
    check(error(f.data("propose", "acronym", "API", "label", "L".repeat(256))) && f.proposals().isEmpty(), "libellé trop long rejeté");
    f = new Fixture(); proposal = f.wiki.addProposal("Version", "API", "pending", "XWiki.Autre", "");
    check(error(f.data("approve", "targetRef", proposal.getFullName(), "expectedVersion", "0.1", "acronym", "API", "label", "Interface")) && f.published().isEmpty(), "décision périmée refusée");
    for (String foreign : List.of("Autre.Espace.Page", "autrewiki:" + PROPOSAL_SPACE + ".Version", PROPOSAL_SPACE + ".WebHome", PROPOSAL_SPACE + ".Version.Enfant")) {
      int reads = f.wiki.authorReads.size();
      check(error(f.data("approve", "targetRef", foreign, "expectedVersion", proposal.getVersion(), "acronym", "API", "label", "Interface"))
          && f.published().isEmpty() && !f.wiki.authorReads.subList(reads, f.wiki.authorReads.size()).contains(new Model().resolveDocument(foreign)), "référence étrangère refusée avant lecture privilégiée : " + foreign);
    }
    Doc noObject = f.wiki.getDocument(new Ref(PROPOSAL_SPACE, "SansObjet")); noObject.save("", true);
    check(error(f.data("reject", "targetRef", noObject.getFullName(), "expectedVersion", noObject.getVersion(), "comment", "Non")), "page sans objet proposition refusée");
    f = new Fixture(); proposal = f.wiki.addProposal("Collision", "API", "pending", "XWiki.Autre", ""); published = f.wiki.add("Proposition_Collision", "EXISTANT");
    check(error(approve(f, proposal, "API", "Interface", "")) && published.obj.getValue("acronyme").equals("EXISTANT") && f.published().size() == 1,
        "publication n’écrase jamais une destination étrangère");
    published.setContent("{{html}}<!-- glossary-proposal:Collision -->{{/html}}"); published.save("", true);
    check(error(f.data("reject", "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "comment", "Non")), "publication partielle ne peut être refusée");
    check(approve(f, proposal, "TARDIF", "Nouveau", "Reprise").startsWith("GLOSSAIRE_APPROVED|") && f.published().size() == 1
        && published.obj.getValue("acronyme").equals("EXISTANT") && proposal.isNew(), "reprise idempotente préserve la publication puis retire la proposition");

    f = new Fixture(); Doc config = f.wiki.getDocument(CONFIG_DOC); Obj configObject = config.newObject(CONFIG_CLASS);
    configObject.set("reviewGroup", "central:XWiki.Relecteurs"); config.save("", true);
    check(error(f.create("INTERDIT", "Non")), "ancien groupe configurable reste appliqué");
    f.userServices.group.memberships.add(new Ref("central", "XWiki", "Relecteurs"));
    check(f.create("AUTORISÉ", "Oui").startsWith("GLOSSAIRE_OK|"), "ancien groupe interwiki reconnu");
  }
  static void importChecks() throws Exception {
    Fixture f = new Fixture(); f.ordinary(); f.wiki.allowed = false; f.userContext.user = new Ref("XWiki", "Importateur");
    f.request.params.put("author", "XWiki.Victime"); f.request.params.put("status", "approved");
    f.request.params.put("canReview", "true"); f.request.params.put("canManage", "true");
    String result = f.importRows(false, false, new String[]{"API|+%", "Interface importée", "Première définition"},
        new String[]{"HTTP", "Protocole", "Définition HTTP"}, new String[]{"DNS", "Noms", "Définition DNS"});
    check(result.split("ROW_PROPOSED\\|", -1).length == 4 && result.contains("GLOSSAIRE_IMPORT_OK|0|0|3|3") && f.proposals().size() == 3 && f.published().isEmpty(),
        "import contributeur : trois lignes produisent exactement trois propositions et aucune fiche publiée");
    check(f.proposals().stream().allMatch(d -> d.getObject(CLASS) == null && d.obj.getValue("status").equals("pending")
        && d.obj.getValue("author").equals("XWiki.Importateur") && d.obj.getValue("submittedAt") instanceof Date
        && d.obj.getValue("reviewer").equals("") && d.obj.getValue("publishedRef").equals("")),
        "import contributeur : auteur authentifié et état en attente fixés côté serveur malgré les paramètres forgés");
    check(f.wiki.normalSaves == 0 && f.wiki.authorSaves == 3 && f.proposals().get(0).obj.getValue("definition").equals("Première définition"),
        "import contributeur : stockage des champs sans droit natif d’édition de DATA");
    Doc imported = f.proposals().get(0); f.manager(); f.wiki.allowed = true;
    check(approve(f, imported, "CORRIGÉ", "Correction import", "Relu").startsWith("GLOSSAIRE_APPROVED|")
        && f.published().size() == 1 && imported.isNew(), "proposition importée validable avec correction par le circuit existant");

    f = new Fixture(); f.wiki.add("API", "API"); f.ordinary(); f.wiki.allowed = false;
    result = f.importRows(false, false, new String[]{"api", "Autre libellé", "Déjà publié"}, new String[]{"NOUVEAU", "Nouveau libellé", "Définition"},
        new String[]{"nouveau", "Nouveau libellé", "Doublon du fichier"}, new String[]{"", "Invalide", "Interdit"},
        new String[]{"SANS_LIBELLE"}, new String[]{"DERNIER", "Dernier libellé"});
    check(result.contains("ROW_SKIP|0|ACRONYM_DUPLICATE") && result.contains("ROW_PROPOSED|1|")
        && result.contains("ROW_SKIP|2|ACRONYM_AND_LABEL_DUPLICATE") && result.contains("ROW_ERROR|3|") && result.contains("ROW_ERROR|4|")
        && result.contains("ROW_PROPOSED|5|") && result.contains("GLOSSAIRE_IMPORT_OK|0|4|6|2")
        && f.proposals().size() == 2 && f.published().size() == 1, "import partiel : doublons publiés et dans le fichier ignorés, lignes invalides isolées, lignes suivantes proposées");
    check(f.proposals().get(1).obj.getValue("acronyme").equals("DERNIER") && f.proposals().get(1).obj.getValue("definition").equals(""),
        "import partiel : une définition absente ne réutilise pas le texte de la ligne précédente");
    result = f.importRows(false, false, new String[]{"NOUVEAU", "Nouveau libellé"});
    check(result.contains("ROW_SKIP|0|ACRONYM_AND_LABEL_DUPLICATE") && f.proposals().size() == 2,
        "import contributeur : les propres propositions en attente sont reconnues comme doublons");
    result = f.importRows(true, true, new String[]{"NOUVEAU", "Nouveau libellé"});
    check(result.contains("ROW_PROPOSED|0|") && f.proposals().size() == 3 && f.published().size() == 1,
        "import contributeur : acceptation explicite des deux types de doublons crée une proposition supplémentaire");
    for (boolean allowAcronym : List.of(false, true)) {
      for (boolean allowLabel : List.of(false, true)) {
        f = new Fixture(); f.wiki.add("API", "API"); f.ordinary(); f.wiki.allowed = false;
        result = f.importRows(allowAcronym, allowLabel, new String[]{"API", "Libellé API"});
        boolean accepted = allowAcronym && allowLabel;
        check(result.contains(accepted ? "ROW_PROPOSED|0|" : "ROW_SKIP|0|") && f.proposals().size() == (accepted ? 1 : 0) && f.published().size() == 1,
            "import contributeur : options de doublons acronymes=" + allowAcronym + ", libellés=" + allowLabel);
      }
    }
    f = new Fixture(); f.ordinary(); f.wiki.addProposal("Autre", "SECRET", "pending", "XWiki.Autre", ""); f.wiki.allowed = false;
    result = f.importRows(false, false, new String[]{"SECRET", "Libellé SECRET"});
    check(result.contains("ROW_PROPOSED|0|") && f.proposals().size() == 2 && f.published().isEmpty(),
        "import contributeur : les propositions privées d’autrui ne sont pas révélées par les doublons");
    for (String denied : List.of("guest", "GET", "csrf")) {
      f = new Fixture(); f.ordinary();
      if (denied.equals("guest")) f.userContext.user = null;
      if (denied.equals("GET")) f.request.method = "GET";
      if (denied.equals("csrf")) f.request.params.remove("form_token");
      check(error(f.importRows(false, false, new String[]{"API", "Interface"})) && f.wiki.docs.isEmpty(), "import bloqué sans création : " + denied);
    }
    f = new Fixture(); f.wiki.authorAllowed = false;
    result = f.importRows(false, false, new String[]{"API", "Interface"});
    check((error(result) || result.contains("ROW_ERROR|0|")) && f.wiki.docs.isEmpty(), "import validateur : l’auteur de confiance doit pouvoir publier");
  }
  static void roleChecks() throws Exception {
    List<String> names = List.of("Lecteurs", "Contributeurs", "Ajouteurs", "Validateurs");
    for (int mask = 0; mask < 16; mask++) {
      Fixture f = new Fixture(); f.role(0); int rank = 0;
      for (int bit = 0; bit < 4; bit++) if ((mask & (1 << bit)) != 0) { f.userServices.group.memberships.add(new Ref("XWiki", names.get(bit))); rank = bit + 1; }
      f.wiki.add("CONFIDENTIEL", "CONFIDENTIEL");
      String html = f.render("WebHome.xwiki", "");
      check(html.contains("data-can-view=\"" + (rank >= 1) + "\"") && html.contains("data-can-propose=\"" + (rank >= 2) + "\"")
          && html.contains("data-can-add=\"" + (rank >= 3) + "\"") && html.contains("data-can-review=\"" + (rank >= 4) + "\""),
          "droits cumulatifs et maximum des appartenances pour masque " + mask);
      check((rank >= 1) == html.contains("CONFIDENTIEL"), "lecture filtrée dès le rendu pour masque " + mask);
      int before = f.published().size(); String result = f.create("DIRECT", "Ajout direct");
      check((rank >= 3) == result.startsWith("GLOSSAIRE_OK|") && f.published().size() == before + (rank >= 3 ? 1 : 0), "ajout direct contrôlé par le rang effectif " + rank);
    }
    for (int rank = 0; rank <= 4; rank++) {
      Fixture f = new Fixture(); f.role(rank); Doc p = f.wiki.addProposal("Role", "API", "pending", "XWiki.Autre", "");
      String result = approve(f, p, "VALIDÉ", "Validation", "");
      check((rank >= 4) == result.startsWith("GLOSSAIRE_APPROVED|") && f.published().size() == (rank >= 4 ? 1 : 0), "validation réservée au niveau4, acteur niveau" + rank);
      f = new Fixture(); f.role(rank); result = f.data("propose", "acronym", "PROPOSITION", "label", "Proposée", "role", "4", "canReview", "true");
      check((rank >= 2) == result.startsWith("GLOSSAIRE_PROPOSED|"), "proposition réservée au niveau2+, rôle forgé ignoré niveau" + rank);
      f = new Fixture(); f.role(rank); Doc source = f.wiki.add("Stable", "ANCIEN");
      check((rank >= 3) == f.save(source.getFullName(), "MODIFIÉ").startsWith("GLOSSAIRE_OK|"), "modification publiée réservée au niveau3+ niveau" + rank);
    }
    Fixture f = new Fixture(); f.configure("", "", "", "central:XWiki.Relecteurs"); f.ordinary();
    f.userServices.group.memberships.add(new Ref("central", "XWiki", "Relecteurs"));
    check(f.create("INTERWIKI", "Groupe qualifié").startsWith("GLOSSAIRE_OK|"), "groupe qualifié interwiki cumule les droits inférieurs");
    f.userServices.group.memberships.clear();
    check(error(f.create("RETIRÉ", "Non")), "appartenance retirée après affichage contrôlée à la requête suivante");
    f = new Fixture(); f.role(3); f.wiki.allowed = false;
    check(f.create("SANS_EDIT", "Droit applicatif").startsWith("GLOSSAIRE_OK|") && f.wiki.normalSaves == 0, "ajouteur autorisé sans EDIT natif écrit par auteur fiable");
    f = new Fixture(); f.wiki.forcedNames.add("0000000000000042"); f.wiki.deniedAuthorReads.add(new Ref(SPACE, "0000000000000042"));
    check(error(f.create("INACCESSIBLE", "Auteur sans accès")) && f.published().isEmpty(), "création refusée si la destination est inaccessible à l’auteur malgré un rôle valide");
    f = new Fixture(); f.wiki.add("PRIVÉ", "PRIVÉ"); f.wiki.deniedAuthorReads.add(new Model().resolveDocument(CONFIG_DOC));
    check(error(f.create("INTERDIT", "Configuration inaccessible")) && !f.render("WebHome.xwiki", "").contains("PRIVÉ"), "configuration inaccessible ne réactive pas les droits publics historiques");
    f = new Fixture(); f.role(0); f.wiki.admin = true;
    String html = f.render("WebHome.xwiki", "");
    check(html.contains("data-can-configure=\"true\"") && html.contains("data-can-add=\"false\"") && error(f.create("ADMIN", "Non implicite")), "administration des paramètres n’accorde pas de rôle métier implicite");
    f = new Fixture(); f.wiki.absoluteReferences = true; f.configure("xwiki:XWiki.XWikiGuest", "", "", ""); f.userContext.user = null;
    html = f.render("WebHome.xwiki", "");
    check(html.contains("data-can-view=\"true\"") && html.contains("data-can-propose=\"false\""), "visiteur explicitement lecteur sans proposition");
  }
  static String decide(Fixture f, Doc d, String action, String comment) throws Exception {
    return f.data(action, "targetRef", d.getFullName(), "expectedVersion", d.getVersion(), "comment", comment,
        "acronym", "REVALIDÉ", "label", "Libellé revalidé", "definition", "Définition revalidée");
  }
  static void lifecycleChecks() throws Exception {
    for (String action : List.of("reject", "trash")) {
      Fixture f = new Fixture(); Doc p = f.wiki.addProposal("Cycle", "API", "pending", "XWiki.Auteur", "");
      p.setContent("{{groovy}}throw new Exception('jamais copié'){{/groovy}}"); p.saveAsAuthor("Fixture", true);
      if (action.equals("reject")) check(error(decide(f, p, action, "   ")) && f.trash().isEmpty() && !p.isNew(), "motif de refus obligatoire avant transfert");
      String result = decide(f, p, action, "Motif <à conserver>"); Doc bin = f.trash().get(0);
      check(result.startsWith(action.equals("reject") ? "GLOSSAIRE_REJECTED|" : "GLOSSAIRE_TRASHED|") && result.split("\\|", -1).length == 4
          && p.isNew() && f.proposals().isEmpty() && bin.ref.name.equals("Cycle"), action + " transfère la proposition en corbeille sous le même identifiant");
      check(bin.obj.getValue("status").equals(action.equals("reject") ? "rejected" : "trashed") && bin.obj.getValue("deletedAt") instanceof Date
          && ((Date) bin.obj.getValue("deletedAt")).getTime() == f.clock.now && bin.obj.getValue("author").equals("XWiki.Auteur")
          && bin.obj.getValue("sourceProposalId").equals("Cycle") && !bin.content.contains("groovy"), "corbeille copie uniquement les champs connus et date serveur " + action);
      check(decide(f, bin, "restore", "Correction").startsWith("GLOSSAIRE_APPROVED|") && bin.isNew() && f.published().size() == 1 && f.proposals().isEmpty()
          && f.published().get(0).obj.getValue("acronyme").equals("REVALIDÉ"), "revalidation depuis la corbeille publie puis retire la fiche " + action);
      check(error(decide(f, bin, "restore", "Encore")) && f.published().size() == 1, "revalidation répétée sans doublon " + action);
    }
    Fixture f = new Fixture(); Doc p = f.wiki.addProposal("Partiel", "API", "pending", "XWiki.Auteur", "");
    f.wiki.failedDeletes.add(p.ref);
    check(error(approve(f, p, "PUBLIÉ", "Déjà publié", "")) && !p.isNew() && f.published().size() == 1, "échec retrait après publication conserve la reprise possible");
    f.wiki.failedDeletes.clear();
    check(approve(f, p, "NE_PAS_ÉCRASER", "Ne pas changer", "").startsWith("GLOSSAIRE_APPROVED|") && p.isNew() && f.published().size() == 1
        && f.published().get(0).obj.getValue("acronyme").equals("PUBLIÉ"), "reprise après retrait échoué sans écraser ni dupliquer la publication");
    f = new Fixture(); p = f.wiki.addProposal("TransfertPartiel", "API", "pending", "XWiki.Auteur", "");
    f.wiki.failedDeletes.add(p.ref); long firstDeletionTime = f.clock.now;
    check(error(decide(f, p, "reject", "Motif initial")) && !p.isNew() && f.trash().size() == 1, "transfert partiel conserve la source tant que sa suppression échoue");
    f.clock.now += 86400000L; f.wiki.failedDeletes.clear();
    String transferRetry = decide(f, p, "reject", "Motif initial");
    check(transferRetry.startsWith("GLOSSAIRE_REJECTED|") && p.isNew()
        && f.trash().size() == 1 && ((Date) f.trash().get(0).obj.getValue("deletedAt")).getTime() == firstDeletionTime,
        "reprise du transfert ne duplique pas la corbeille et ne prolonge pas la conservation : " + transferRetry);
    f = new Fixture(); Doc expired = f.addTrash("Expire", "ANCIEN", "rejected", "XWiki.Auteur", "Ancien", WEEK);
    check(error(decide(f, expired, "restore", "Trop tard")) && !expired.isNew() && f.published().isEmpty(), "revalidation refusée dès sept jours");
    Doc recent = f.addTrash("Recent", "RÉCENT", "trashed", "XWiki.Auteur", "Récent", WEEK - 1);
    Doc future = f.addTrash("Futur", "FUTUR", "rejected", "XWiki.Auteur", "Futur", -1);
    Doc pending = f.addTrash("PasCorbeille", "ATTENTE", "pending", "XWiki.Auteur", "État invalide", WEEK + 1);
    Doc missingDate = f.addTrash("SansDate", "SANS_DATE", "rejected", "XWiki.Auteur", "Sans date", WEEK + 1); missingDate.obj.set("deletedAt", "");
    Doc noClass = f.wiki.getDocument(new Ref(TRASH_SPACE, "SansClasse")); noClass.setContent("Document étranger"); noClass.save("", true);
    f.role(1); String result = f.data("purge");
    check(result.equals("GLOSSAIRE_PURGED|1") && expired.isNew() && !recent.isNew() && !future.isNew() && !pending.isNew() && !missingDate.isNew() && !noClass.isNew(), "purge à sept jours limitée aux éléments expirés de corbeille connus");
    f.clock.now++;
    check(f.data("purge").equals("GLOSSAIRE_PURGED|1") && recent.isNew() && !future.isNew(), "purge utilise l’horloge serveur et inclut l’échéance exacte");
    for (String denied : List.of("GET", "csrf", "role")) {
      f = new Fixture(); f.role(1); Doc bin = f.addTrash("Interdit", "API", "rejected", "XWiki.Auteur", "Motif", WEEK + 1);
      if (denied.equals("GET")) f.request.method = "GET";
      if (denied.equals("csrf")) f.request.params.remove("form_token");
      if (denied.equals("role")) f.ordinary();
      check(error(f.data("purge")) && !bin.isNew(), "purge refusée : " + denied);
    }
    f = new Fixture(); Doc unreadable = f.addTrash("Inaccessible", "API", "rejected", "XWiki.Auteur", "Motif", WEEK + 1);
    f.wiki.deniedAuthorReads.add(unreadable.ref);
    check(error(f.data("purge")) && !unreadable.isNew(), "purge signale une corbeille inaccessible au lieu d’annoncer un succès vide");
    for (String action : List.of("restore", "trash")) {
      f = new Fixture(); f.role(3); Doc d = action.equals("trash") ? f.wiki.addProposal("Gestion", "API", "pending", "XWiki.Auteur", "")
          : f.addTrash("Gestion", "API", "rejected", "XWiki.Auteur", "Motif", 0);
      check(error(decide(f, d, action, "Non")) && !d.isNew(), action + " réservé au niveau4 malgré les droits d’ajout");
    }
  }
  static String settings(Fixture f, String version, String... rows) throws Exception {
    f.request.params.keySet().removeIf(key -> key.matches("(group|level)_[0-9]+"));
    List<String> args = new ArrayList<>(List.of("expectedVersion", version)); args.addAll(List.of(rows));
    return f.data("settings", args.toArray(String[]::new));
  }
  static void settingsChecks() throws Exception {
    Fixture f = new Fixture(); f.role(0); f.wiki.admin = true;
    for (String name : List.of("Lecteurs", "Contributeurs", "Ajouteurs", "Validateurs")) f.group("XWiki." + name);
    Doc config = f.wiki.getDocument(CONFIG_DOC); String version = config.getVersion();
    String result = settings(f, version, "group_0", "XWiki.Lecteurs", "level_0", "1", "group_1", "XWiki.Contributeurs", "level_1", "2",
        "group_2", "XWiki.Ajouteurs", "level_2", "3", "group_3", "XWiki.Validateurs", "level_3", "4", "group_4", "XWiki.XWikiGuest", "level_4", "1");
    Obj object = config.getObject(CONFIG_CLASS);
    check(result.startsWith("GLOSSAIRE_SETTINGS_SAVED") && object.getValue("schemaVersion").equals("2")
        && object.getValue("viewGroups").toString().contains("XWiki.Lecteurs") && object.getValue("viewGroups").toString().contains("XWiki.XWikiGuest")
        && object.getValue("proposeGroups").equals("XWiki.Contributeurs") && object.getValue("directAddGroups").equals("XWiki.Ajouteurs")
        && object.getValue("reviewGroups").equals("XWiki.Validateurs"), "paramètres admin : groupes existants et niveaux enregistrés par listes distinctes");
    for (String protectedRef : List.of("TestPage.PAGE.Glossaire.WebHome", DATA_DOC)) {
      Doc protectedDoc = f.wiki.getDocument(protectedRef);
      check(protectedDoc.getObjects(RIGHTS_CLASS).stream().anyMatch(o -> o.getValue("levels").equals("view")
          && o.getValue("groups").toString().contains("XWiki.Lecteurs") && o.getValue("groups").toString().contains("XWiki.Validateurs")
          && o.getValue("users").toString().contains("XWiki.XWikiGuest") && o.getValue("allow").toString().equals("1"))
          && protectedDoc.getObjects(RIGHTS_CLASS).stream().anyMatch(o -> o.getValue("levels").equals("edit,delete") && o.getValue("groups").equals("")
          && o.getValue("users").toString().contains("XWiki.ScriptAuthor")), "paramètres protègent consultation native et édition des scripts : " + protectedRef);
    }
    check(error(settings(f, version, "group_0", "XWiki.Lecteurs", "level_0", "1")), "modification de configuration périmée refusée");
    for (String[] row : List.of(new String[]{"group_0", "XWiki.Inconnu", "level_0", "4"}, new String[]{"group_0", "XWiki.XWikiGuest", "level_0", "2"},
        new String[]{"group_0", "XWiki.Lecteurs", "level_0", "5"}, new String[]{"group_0", "XWiki.Lecteurs", "level_0", "1", "group_1", "xwiki:XWiki.Lecteurs", "level_1", "4"})) {
      String before = config.getVersion();
      check(error(settings(f, before, row)) && config.getVersion().equals(before), "paramètres invalides sans écriture : " + Arrays.toString(row));
    }
    Fixture acl = new Fixture(); acl.role(0); acl.wiki.admin = true; acl.group("XWiki.Lecteurs"); acl.group("XWiki.Ajouteurs");
    Doc term = acl.wiki.add("Ancienne", "ANCIEN"); Obj mixed = term.newObject(RIGHTS_CLASS);
    mixed.set("levels", "view,edit,delete,admin,comment"); mixed.set("groups", "XWiki.Anciens"); mixed.set("users", ""); mixed.set("allow", 0); term.save("Fixture ACL", true);
    Doc privateProposal = acl.wiki.addProposal("Privée", "SECRET", "pending", "XWiki.Autre", "");
    result = settings(acl, acl.wiki.getDocument(CONFIG_DOC).getVersion(), "group_0", "XWiki.Lecteurs", "level_0", "1", "group_1", "XWiki.Ajouteurs", "level_1", "3");
    check(result.startsWith("GLOSSAIRE_SETTINGS_SAVED") && mixed.getValue("levels").equals("admin,comment") && mixed.getValue("allow").equals(0), "sync ACL préserve les droits étrangers aux niveaux gérés");
    check(term.getObjects(RIGHTS_CLASS).stream().anyMatch(o -> o.getValue("levels").equals("edit,delete") && o.getValue("groups").equals("") && o.getValue("users").toString().contains("XWiki.ScriptAuthor"))
        && privateProposal.getObjects(RIGHTS_CLASS).stream().allMatch(o -> o.getValue("groups").equals("") && !o.getValue("users").toString().contains("XWiki.XWikiGuest"))
        && privateProposal.getObjects(RIGHTS_CLASS).stream().anyMatch(o -> o.getValue("levels").equals("view") && o.getValue("users").toString().contains("XWiki.ScriptAuthor")), "ACL des fiches réserve EDIT natif aux auteurs fiables et protège les propositions privées");
    for (String privateSpace : List.of(PROPOSAL_SPACE, TRASH_SPACE)) {
      Doc preferences = acl.wiki.getDocument(privateSpace + ".WebPreferences");
      check(preferences.getObjects("XWiki.XWikiGlobalRights").stream().anyMatch(o -> o.getValue("levels").equals("view") && o.getValue("groups").equals("")
          && o.getValue("users").toString().contains("XWiki.ScriptAuthor"))
          && preferences.getObjects(RIGHTS_CLASS).stream().anyMatch(o -> o.getValue("levels").equals("edit,delete") && o.getValue("groups").equals("")),
          "paramètres protègent les accès directs et les préférences privées de " + privateSpace);
    }
    Fixture multiple = new Fixture(); multiple.role(0); multiple.wiki.admin = true; multiple.group("XWiki.Premier"); multiple.group("XWiki.Second");
    result = settings(multiple, multiple.wiki.getDocument(CONFIG_DOC).getVersion(), "group_0", "XWiki.Premier", "level_0", "3", "group_1", "XWiki.Second", "level_1", "3");
    check(result.startsWith("GLOSSAIRE_SETTINGS_SAVED") && multiple.wiki.getDocument(CONFIG_DOC).getObject(CONFIG_CLASS).getValue("directAddGroups").equals("XWiki.Premier\nXWiki.Second"),
        "plusieurs groupes du même niveau sont séparés par un vrai saut de ligne");
    multiple.wiki.admin = false; multiple.ordinary(); multiple.userServices.group.memberships.add(new Ref("XWiki", "Second"));
    check(multiple.create("SECOND", "Droit du second groupe").startsWith("GLOSSAIRE_OK|")
        && multiple.render("WebHome.xwiki", "").contains("data-can-add=\"true\""), "deuxième groupe relu correctement côté DATA et affichage après sauvegarde");
    Fixture absolute = new Fixture(); absolute.wiki.absoluteReferences = true; absolute.configure("xwiki:XWiki.XWikiGuest", "", "", ""); absolute.wiki.admin = true;
    String guestSettings = absolute.render("WebHome.xwiki", "");
    check(guestSettings.split("data-group-ref=\"[^\"]*XWiki\\.XWikiGuest\"", -1).length == 2, "une seule ligne visiteur dans les paramètres avec sérialisation absolue");
    for (String denied : List.of("admin", "GET", "csrf")) {
      f = new Fixture(); f.role(4); f.wiki.admin = true; config = f.wiki.getDocument(CONFIG_DOC);
      if (denied.equals("admin")) f.wiki.admin = false;
      if (denied.equals("GET")) f.request.method = "GET";
      if (denied.equals("csrf")) f.request.params.remove("form_token");
      String before = config.getVersion();
      check(error(settings(f, before)) && config.getVersion().equals(before), "paramètres refusés : " + denied);
    }
  }
  static void literalTitle(Doc doc, String expected, String label) throws Exception {
    VelocityContext context = new VelocityContext(); context.put("escapetool", new Escape());
    StringWriter rendered = new StringWriter(); ENGINE.evaluate(context, rendered, label, doc.title);
    check(rendered.toString().equals(expected) && context.get("pwned") == null, label + " : titre rendu littéralement sans exécuter le contenu utilisateur");
  }
  static void titleAndClassChecks() throws Exception {
    String payload = "#set($pwned=true)HACK C# $prix";
    Fixture f = new Fixture(); check(f.create(payload, "Création").startsWith("GLOSSAIRE_OK|"), "création accepte les caractères légitimes des acronymes");
    Doc direct = f.published().get(0); literalTitle(direct, payload, "création directe");
    check(direct.getObject(CLASS).getValue("acronyme").equals(payload), "échappement du titre ne modifie pas le champ acronyme");
    check(f.save(direct.getFullName(), payload + " corrigé").startsWith("GLOSSAIRE_OK|"), "modification conserve l’acronyme avec caractères Velocity");
    literalTitle(direct, payload + " corrigé", "modification de fiche");
    f = new Fixture(); check(f.importRows(false, false, new String[]{payload, "Import", "Définition"}).contains("ROW_OK|0|"), "import direct accepte les acronymes à caractères Velocity");
    literalTitle(f.published().get(0), payload, "import direct");
    f = new Fixture(); f.ordinary(); check(f.data("propose", "acronym", payload, "label", "Proposition").startsWith("GLOSSAIRE_PROPOSED|"), "proposition accepte l’acronyme littéral");
    Doc pending = f.proposal(); literalTitle(pending, payload, "nouvelle proposition");
    check(pending.obj.getValue("acronyme").equals(payload), "proposition conserve la saisie exacte dans l’objet");
    f.manager(); check(approve(f, pending, payload, "Validation", "").startsWith("GLOSSAIRE_APPROVED|"), "validation de proposition à titre sensible");
    literalTitle(f.published().get(0), payload, "publication après validation");
    f = new Fixture(); f.ordinary(); check(f.importRows(false, false, new String[]{payload, "Import proposé", "Définition"}).contains("ROW_PROPOSED|0|"), "import de propositions accepte l’acronyme littéral");
    literalTitle(f.proposal(), payload, "import de proposition");
    f = new Fixture(); Doc legacy = f.wiki.addProposal("AncienneTitre", payload, "pending", "XWiki.Auteur", ""); legacy.setTitle(payload); legacy.saveAsAuthor("Ancien titre brut", true);
    check(decide(f, legacy, "trash", "Retirée").startsWith("GLOSSAIRE_TRASHED|"), "ancienne proposition transférée en corbeille");
    literalTitle(f.trash().get(0), payload, "corbeille depuis ancien titre brut");
    f = new Fixture(); f.wiki.admin = true; legacy = f.wiki.add("AncienneTitre", "Ancien acronyme"); legacy.setTitle(payload); legacy.save("Ancien titre brut", true);
    check(f.data("migrate").equals("GLOSSAIRE_MIGRATED|1|0"), "migration de page au contenu vide et ancien titre sensible");
    literalTitle(f.published().get(0), payload, "migration d’ancien titre");
    for (String missing : List.of("sourceProposalId", "status", "author", "submittedAt")) {
      f = new Fixture(); f.ordinary(); f.wiki.ignoredFields.put(PROPOSAL_CLASS, Set.of(missing));
      check(error(f.data("propose", "acronym", "API", "label", "Interface", "definition", "Définition")) && f.proposals().isEmpty() && f.wiki.authorSaves == 0,
          "classe de proposition incomplète détectée avant publication en attente : " + missing);
    }
    for (String missing : List.of("sourceProposalId", "deletedAt", "status")) {
      f = new Fixture(); Doc original = f.wiki.addProposal("Conserver", "API", "pending", "XWiki.Auteur", ""); f.wiki.ignoredFields.put(PROPOSAL_CLASS, Set.of(missing));
      check(error(decide(f, original, "reject", "Motif")) && !original.isNew() && f.trash().isEmpty() && f.wiki.authorDeletes.isEmpty(),
          "classe de corbeille incomplète conserve la proposition source : " + missing);
    }
  }
  static void migrationChecks() throws Exception {
    Fixture f = new Fixture(); f.role(0); f.wiki.admin = true;
    Doc legacy = f.wiki.add("API", "API"); legacy.setContent(""); legacy.setTitle("Titre personnalisé"); legacy.save("Fixture", true);
    Doc legacyLong = f.wiki.add("ABCDEFGHIJKLMNOP", "ACRONYME 16 caractères");
    Doc stable = f.wiki.add("0000000000000099", "STABLE"); stable.setContent("{{html}}<!-- glossary-id:0000000000000099 -->{{/html}}"); stable.save("Fixture", true);
    Doc publication = f.wiki.add("Proposition_Ancienne", "PUBLICATION"); publication.setContent("{{html}}<!-- glossary-proposal:Ancienne -->{{/html}}"); publication.save("Fixture", true);
    String result = f.data("migrate");
    check(result.equals("GLOSSAIRE_MIGRATED|2|0") && legacy.isNew() && legacyLong.isNew() && !stable.isNew() && !publication.isNew() && f.published().size() == 4,
        "migration manuelle convertit aussi les anciens acronymes de seize caractères sans marqueur");
    Doc converted = f.published().stream().filter(d -> d.obj.getValue("acronyme").equals("API")).findFirst().orElseThrow();
    check(converted.title.equals("Titre personnalisé") && converted.content.contains("<!-- glossary-id:" + converted.ref.name + " -->")
        && converted.obj.getValue("libelle").equals("Libellé API"), "migration de contenu vide conserve titre personnalisé et données avec marqueur stable");
    check(f.data("migrate").equals("GLOSSAIRE_MIGRATED|0|0") && f.published().size() == 4, "migration rejouée idempotente");
    for (String unsafeContent : List.of("Contenu utile personnalisé", "{{velocity}}$xwiki.secret{{/velocity}}")) {
      Fixture unsafe = new Fixture(); unsafe.wiki.admin = true;
      Doc untouched = unsafe.wiki.add("Personnalisée", "ANCIEN"); untouched.setContent(unsafeContent); untouched.setTitle("Titre conservé");
      untouched.contentAuthor = new Ref("XWiki", "NativeEditor"); untouched.save("Fixture contenu inconnu", true);
      int normalBefore = unsafe.wiki.normalSaves, authorBefore = unsafe.wiki.authorSaves; String versionBefore = untouched.getVersion();
      check(unsafe.data("migrate").equals("GLOSSAIRE_MIGRATED|0|1") && !untouched.isNew() && unsafe.published().size() == 1
          && unsafe.refactoring.calls == 0 && unsafe.wiki.authorDeletes.isEmpty() && untouched.getVersion().equals(versionBefore)
          && unsafe.wiki.normalSaves == normalBefore && unsafe.wiki.authorSaves == authorBefore
          && untouched.content.equals(unsafeContent) && untouched.title.equals("Titre conservé")
          && untouched.getContentAuthorReference().equals(new Ref("XWiki", "NativeEditor")), "migration ignore un contenu inconnu avant tout renommage ou changement d’auteur : " + unsafeContent);
    }
    Fixture whitespace = new Fixture(); whitespace.wiki.admin = true;
    Doc blank = whitespace.wiki.add("Espaces", "AVANT"); blank.setContent("  \n\t"); blank.save("Ancien contenu blanc", true);
    String migratedWhitespace = whitespace.data("migrate"); Doc afterWhitespace = whitespace.published().get(0); String stableRef = afterWhitespace.getFullName();
    check(migratedWhitespace.equals("GLOSSAIRE_MIGRATED|1|0") && blank.isNew() && whitespace.save(stableRef, "APRÈS").startsWith("GLOSSAIRE_OK|")
        && afterWhitespace.getFullName().equals(stableRef) && afterWhitespace.obj.getValue("acronyme").equals("APRÈS"), "espaces inertes conservés autour du marqueur de migration ne bloquent pas les modifications suivantes");
    Fixture collision = new Fixture(); collision.wiki.admin = true;
    Doc previous = collision.wiki.add("0000000000000010", "OCCUPÉ"); previous.setContent("<!-- glossary-id:0000000000000010 -->"); previous.save("Fixture", true);
    Doc nested = collision.wiki.getDocument(new Ref(SPACE + ".0000000000000020", "WebHome")); nested.setTitle("Page imbriquée existante"); nested.save("Fixture", true);
    Doc toConvert = collision.wiki.add("Ancienne", "À_CONVERTIR"); collision.wiki.forcedNames.addAll(List.of("0000000000000010", "0000000000000020"));
    check(collision.data("migrate").equals("GLOSSAIRE_MIGRATED|1|0") && toConvert.isNew() && !previous.isNew() && !nested.isNew()
        && previous.obj.getValue("acronyme").equals("OCCUPÉ") && nested.title.equals("Page imbriquée existante"), "migration évite les collisions terminales et imbriquées sans écrasement");
    for (String denied : List.of("admin", "GET", "csrf")) {
      f = new Fixture(); f.wiki.admin = true; Doc old = f.wiki.add("Ancienne", "ANCIENNE");
      if (denied.equals("admin")) f.wiki.admin = false;
      if (denied.equals("GET")) f.request.method = "GET";
      if (denied.equals("csrf")) f.request.params.remove("form_token");
      check(error(f.data("migrate")) && !old.isNew() && f.refactoring.calls == 0, "migration refusée sans mutation : " + denied);
    }
    for (String failure : List.of("null", "noop", "retain")) {
      f = new Fixture(); f.wiki.admin = true; Doc old = f.wiki.add("Ancienne", "ANCIENNE"); f.refactoring.failure = failure;
      check(f.data("migrate").equals("GLOSSAIRE_MIGRATED|0|1") && !old.isNew() && f.wiki.authorDeletes.isEmpty(), "échec de migration signalé sans suppression automatique : " + failure);
    }
  }
  static void inertPageChecks() throws Exception {
    for (String filename : List.of("WebHome.xwiki")) {
      for (String action : List.of("checkAndCreate", "create", "save", "delete", "import", "propose", "approve", "reject", "trash", "restore", "purge", "settings", "migrate")) {
        Fixture f = new Fixture(); Doc source = f.wiki.add("API", "API");
        Doc proposal = f.wiki.addProposal("Attente", "HTTP", "pending", "XWiki.Autre", "");
        int normalSaves = f.wiki.normalSaves, authorSaves = f.wiki.authorSaves;
        f.render(filename, action, "acronyme", "FORGÉ", "libelle", "Interdit", "acronym", "FORGÉ", "label", "Interdit", "definition", "Interdit",
            "targetRef", action.equals("approve") || action.equals("reject") ? proposal.getFullName() : source.getFullName(),
            "expectedVersion", proposal.getVersion(), "comment", "Interdit", "acronym_0", "FORGÉ", "label_0", "Interdit");
        check(f.wiki.docs.size() == 2 && f.wiki.normalSaves == normalSaves && f.wiki.authorSaves == authorSaves
            && f.refactoring.calls == 0 && !source.isNew() && source.obj.getValue("acronyme").equals("API")
            && proposal.obj.getValue("status").equals("pending"), filename + " reste sans mutation malgré POST forgé " + action);
      }
    }
    Fixture f = new Fixture(); String html = f.render("WebHome.xwiki", "");
    check(html.contains("data-endpoint-url=\"" + DATA_URL + "\"") && !html.contains("data-workflow-url")
        && !html.contains("GlossaireWorkflow") && !html.contains("COMMANDE"), "affichage expose uniquement le point d’entrée DATA");
    check(!Files.exists(ROOT.resolve("COMMANDE.xwiki")), "aucune page COMMANDE supplémentaire à installer");
    check(f.wiki.jsx.requested.equals(List.of("TestPage.PAGE.Glossaire.CODE.GlossaireExtension", "TestPage.PAGE.Glossaire.CODE.GlossairePageExtension")),
        "seules les deux extensions JavaScript existantes sont chargées");
  }
  static void writeWorkflowFixtures(Path directory) throws Exception {
    Fixture reviewer = new Fixture(); reviewer.wiki.add("API", "API");
    reviewer.wiki.addProposal("Attente1", "HTTP", "pending", "XWiki.Contributeur", "");
    reviewer.wiki.addProposal("Attente2", "DNS", "pending", "XWiki.Autre", "");
    reviewer.addTrash("Refuse1", "REFUSÉ", "rejected", "XWiki.Contributeur", "Définition à préciser.", 1000);
    reviewer.addTrash("Supprime2", "SUPPRIMÉ", "trashed", "XWiki.Autre", "Proposition retirée.", 2000);
    Files.writeString(directory.resolve("glossaire-reviewer.html"), reviewer.render("WebHome.xwiki", ""));
    Fixture reader = new Fixture(); reader.ordinary(); reader.wiki.add("API", "API");
    reader.addTrash("Refus", "HTTP", "rejected", "XWiki.Test", "Précisez la définition.", 1000);
    reader.wiki.addProposal("Autre", "SECRET_AUTRE", "pending", "XWiki.Autre", "CONFIDENTIEL_AUTRE");
    Files.writeString(directory.resolve("glossaire-reader.html"), reader.render("WebHome.xwiki", ""));
    Fixture guest = new Fixture(); guest.userContext.user = null; guest.wiki.add("API", "API");
    Files.writeString(directory.resolve("glossaire-guest.html"), guest.render("WebHome.xwiki", ""));
    for (int level : List.of(0, 1, 3)) {
      Fixture profile = new Fixture(); profile.role(level); profile.wiki.add("API", "API");
      Files.writeString(directory.resolve("glossaire-" + (level == 0 ? "noaccess" : level == 1 ? "viewer" : "adder") + ".html"), profile.render("WebHome.xwiki", ""));
    }
    Fixture admin = new Fixture(); admin.role(0); admin.wiki.admin = true; admin.wiki.add("Ancienne", "Ancienne");
    for (String name : List.of("Lecteurs", "Contributeurs", "Ajouteurs", "Validateurs")) admin.group("XWiki." + name);
    Files.writeString(directory.resolve("glossaire-admin.html"), admin.render("WebHome.xwiki", ""));
    String reviewerHtml = reviewer.render("WebHome.xwiki", "");
    check(reviewerHtml.contains(">2</span>") && reviewerHtml.split("class=\"glossary-proposal-card\"", -1).length == 3
        && reviewerHtml.split("class=\"glossary-trash-card\"", -1).length == 3, "fixtures validateur avec deux attentes et deux éléments en corbeille");
  }
  public static void main(String[] args) throws Exception {
    ENGINE.init();
    for (String filename : List.of("WebHome.xwiki", "DATA/WebHome.xwiki")) {
      new Fixture().render(filename, "");
      check(true, "source Velocity complète analysable jusqu’à la fin : " + filename);
    }
    String fullSource = Files.readString(ROOT.resolve("WebHome.xwiki"));
    int finalEnd = fullSource.lastIndexOf("#end");
    String truncatedSource = fullSource.substring(0, finalEnd) + fullSource.substring(finalEnd + 4);
    boolean rejectedTruncatedSource = false;
    try {
      ENGINE.evaluate(new VelocityContext(), new StringWriter(), "glossaire-tronque", velocityBody(truncatedSource));
    } catch (org.apache.velocity.exception.ParseErrorException expected) {
      rejectedTruncatedSource = true;
    }
    check(rejectedTruncatedSource, "le parseur détecte un bloc final incomplet au lieu de masquer l’erreur de fin de fichier");

    Fixture f = new Fixture(); Doc source = f.wiki.add("API", "API"); String originalRef = source.getFullName();
    String result = f.save(originalRef, "NOUVEAU");
    check(result.startsWith("GLOSSAIRE_OK|") && !source.isNew() && source.getFullName().equals(originalRef)
        && f.published().size() == 1 && source.obj.getValue("acronyme").equals("NOUVEAU") && f.refactoring.calls == 0, "modifier l’acronyme conserve la fiche et sa référence");
    check(f.save(originalRef, "A/B|${texte}").startsWith("GLOSSAIRE_OK|") && f.published().size() == 1 && !source.isNew(), "modifications successives et caractères techniques restent de simples champs");
    check(f.delete(originalRef).equals("GLOSSAIRE_OK") && f.published().isEmpty(), "suppression cible la référence stable après modifications");
    f = new Fixture(); source = f.wiki.add("API", "API"); Doc occupied = f.wiki.add("NOUVEAU", "AUTRE");
    check(f.save(source.getFullName(), "NOUVEAU").startsWith("GLOSSAIRE_OK|") && f.published().size() == 2 && occupied.obj.getValue("acronyme").equals("AUTRE"), "modifier un acronyme ne renomme ni n’écrase une autre fiche");
    f = new Fixture(); source = f.wiki.add("A.B", "A.B"); f.wiki.failedDeletes.add(source.ref);
    check(error(f.delete(source.getFullName())) && !source.isNew(), "suppression inaboutie conserve la fiche et signale l’échec");
    for (String denied : List.of("GET", "csrf", "author", "view")) {
      f = new Fixture(); source = f.wiki.add("API", "API");
      if (denied.equals("GET")) f.request.method = "GET";
      if (denied.equals("csrf")) f.request.params.put("form_token", "bad");
      if (denied.equals("author")) f.wiki.authorAllowed = false;
      if (denied.equals("view")) f.wiki.visible = false;
      check(error(f.delete(source.getFullName())) && !source.isNew(), "suppression refusée : " + denied);
    }
    f = new Fixture(); source = f.wiki.add("Personnalisée", "ANCIEN"); source.setContent("{{velocity}}$xwiki.secret{{/velocity}}"); source.save("Contenu personnalisé", true);
    int authorSavesBefore = f.wiki.authorSaves;
    check(error(f.save(source.getFullName(), "NOUVEAU")) && source.obj.getValue("acronyme").equals("ANCIEN") && f.wiki.authorSaves == authorSavesBefore,
        "une page au contenu personnalisé ne peut être promue à l’auteur de confiance par une modification de champ");
    f = new Fixture(); source = f.wiki.add("API", "API"); f.wiki.allowed = false;
    check(f.save(source.getFullName(), "NOUVEAU").startsWith("GLOSSAIRE_OK|") && f.wiki.authorSaves == 1, "écriture fiable sans droit EDIT natif du rôle autorisé");
    f = new Fixture(); Ref foreign = new Ref("Autre.Espace", "Page"); source = f.wiki.getDocument(foreign); source.newObject(CLASS); source.save("", false);
    check(error(f.delete(foreign.toString())) && !source.isNew(), "suppression limitée à DATA malgré une classe valide ailleurs");
    f = new Fixture(); result = f.create("API", "Interface");
    check(result.startsWith("GLOSSAIRE_OK|") && f.published().size() == 1 && !f.published().get(0).ref.name.equals("API")
        && f.published().get(0).obj.getValue("definition").equals("Définition créée"), "création avec identifiant opaque indépendant du texte");
    for (String invalid : List.of("", "   ", "A".repeat(256))) {
      f = new Fixture(); check(error(f.create(invalid, "Interface")) && f.published().isEmpty(), "création invalide : " + invalid.length());
    }
    f = new Fixture(); check(error(f.create("API", "L".repeat(256))) && f.published().isEmpty(), "création libellé trop long refusée");
    f = new Fixture(); occupied = f.wiki.add("API", "EXISTANT"); result = f.create("API", "Interface");
    check(result.startsWith("GLOSSAIRE_OK|") && f.published().size() == 2 && occupied.obj.getValue("acronyme").equals("EXISTANT"), "nouvel identifiant ne touche pas une ancienne fiche nommée par acronyme");
    f = new Fixture(); result = f.create("A/B|${texte} +%", "Interface");
    check(result.startsWith("GLOSSAIRE_OK|") && f.published().size() == 1 && f.published().get(0).obj.getValue("acronyme").equals("A/B|${texte} +%"), "caractères spéciaux stockés sans interpolation de référence");
    for (String denied : List.of("guest", "GET", "csrf", "author")) {
      f = new Fixture(); if (denied.equals("guest")) f.userContext.user = null;
      if (denied.equals("GET")) f.request.method = "GET";
      if (denied.equals("csrf")) f.request.params.remove("form_token");
      if (denied.equals("author")) f.wiki.authorAllowed = false;
      check(error(f.create("API", "Interface")) && f.published().isEmpty(), "création bloquée : " + denied);
    }
    f = new Fixture(); source = f.wiki.add("A.B", "A.B"); source.obj.set("libelle", "<img src=x onerror=alert(1)>"); source.obj.set("definition", "</textarea><script>alert(1)</script>");
    String html = f.render("WebHome.xwiki", "");
    check(html.contains("A.B") && html.contains("&lt;img") && !html.contains("<script>"), "affichage échappé et ancienne référence avec point");
    if (args.length > 0) Files.writeString(Path.of(args[0]), html);
    f = new Fixture(); result = f.importRows(false, false, new String[]{"A.B", "Interface", "<texte>"}, new String[]{"A.B", "Interface"});
    check(result.contains("ROW_OK|0|") && result.contains("ROW_SKIP|1|") && f.published().size() == 1 && f.proposals().isEmpty(), "import direct et doublons inchangés");
    dataChecks();
    importChecks();
    roleChecks();
    lifecycleChecks();
    settingsChecks();
    migrationChecks();
    titleAndClassChecks();
    inertPageChecks();
    if (args.length > 0) writeWorkflowFixtures(Path.of(args[0]).toAbsolutePath().getParent());
    System.out.println(checks + " vérifications Velocity réussies.");
  }
}
