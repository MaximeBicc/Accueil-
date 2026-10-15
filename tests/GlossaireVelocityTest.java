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
    public String serialize(Ref ref) { return ref.toString(); }
    public String serialize(Ref ref, String hint) { return ref.toString(); }
  }
  public static class Obj {
    final Map<String, Object> values = new HashMap<>();
    public Object getValue(String key) { return values.getOrDefault(key, ""); }
    public void set(String key, Object value) { values.put(key, value); }
  }
  public static class Doc {
    final Wiki wiki; final Ref ref; Obj obj; String title = "", content = ""; int revision;
    final Map<String, Obj> objects = new HashMap<>();
    Doc(Wiki wiki, Ref ref) { this.wiki = wiki; this.ref = ref; }
    public boolean isNew() { return !wiki.docs.containsKey(ref); }
    public Obj getObject(String className) { return objects.get(className); }
    public Obj newObject(String className) { obj = new Obj(); objects.put(className, obj); return obj; }
    public String getFullName() { return ref.toString(); }
    public String getName() { return ref.name; }
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
    final List<Ref> authorReads = new ArrayList<>();
    final Extension jsx = new Extension(), ssx = new Extension();
    boolean allowed = true, authorAllowed = true; int normalSaves, authorSaves, uniqueId;
    public Extension getJsx() { return jsx; }
    public Extension getSsx() { return ssx; }
    public Doc getDocument(Object ref) {
      Ref reference = ref instanceof Ref r ? r : new Model().resolveDocument(String.valueOf(ref));
      return docs.getOrDefault(reference, new Doc(this, reference));
    }
    public Doc getDocumentAsAuthor(Ref ref) { authorReads.add(ref); return authorAllowed ? getDocument(ref) : null; }
    public String getUniquePageName(String space) { return String.format("%016d", ++uniqueId); }
    public String getURL(String reference, String action) { return "https://wiki.test/bin/" + action + "/" + reference.replace(".", "/"); }
    public boolean hasAccessLevel(String right, String user, String reference) { return allowed; }
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
    public Collection<Ref> getGroups(Ref user, Object wiki, boolean recursive) {
      if (!recursive || !(wiki instanceof WikiRef)) throw new IllegalArgumentException("Recursive group lookup must use wiki reference");
      return memberships;
    }
  }
  public static class UserServices {
    final Group group = new Group();
    public Group getGroup() { return group; }
  }
  public static class DateTool { public Date getDate() { return new Date(1791979200000L); } }
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
        dest.obj = source.obj; dest.objects.putAll(source.objects); dest.content = source.content; dest.save("", false);
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
    Fixture() { request.params.put("form_token", "test-token"); }
    String render(String filename, String action, String... pairs) throws Exception {
      request.params.put("action", action);
      for (int i = 0; i < pairs.length; i += 2) request.params.put(pairs[i], pairs[i + 1]);
      Response response = new Response(); VelocityContext context = new VelocityContext();
      context.put("xwiki", wiki); context.put("request", request); context.put("response", response);
      String documentName = filename.equals("DATA/WebHome.xwiki") ? DATA_DOC : "TestPage.PAGE.Glossaire.WebHome";
      context.put("doc", wiki.getDocument(documentName));
      context.put("xcontext", userContext); context.put("escapetool", new Escape()); context.put("datetool", new DateTool());
      context.put("services", Map.of("model", new Model(), "csrf", new Csrf(), "refactoring", refactoring, "icon", new Icon(), "user", userServices));
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
    List<Doc> published() { return wiki.docs.values().stream().filter(d -> d.ref.parent.equals(SPACE)).toList(); }
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
    int saves = f.wiki.normalSaves;
    check(error(f.save(source.getFullName(), "HACK")) && source.obj.getValue("acronyme").equals("API"), "non-membre : modification refusée côté serveur");
    check(error(f.delete(source.getFullName())) && !source.isNew() && f.refactoring.calls == 0, "non-membre : suppression refusée côté serveur");
    String result = f.data("import", "acronym_0", "HACK", "label_0", "Interdit");
    check(result.contains("ROW_PROPOSED|0|") && f.proposals().size() == 1 && f.published().size() == 1 && f.wiki.normalSaves == saves, "non-membre : import proposé sans publication directe");
    String html = f.render("WebHome.xwiki", "checkAndCreate", "acronyme", "HACK", "libelle", "Interdit");
    check(f.published().size() == 1 && f.wiki.normalSaves == saves, "non-membre : ancien ajout direct sans mutation sur la page d’affichage");
    check(error(f.create("HACK", "Interdit")) && f.published().size() == 1 && f.wiki.normalSaves == saves, "non-membre : création forcée refusée par DATA");
    check(!html.contains("glossary-col-actions") && !html.contains("btnReviewGlossaryProposals") && html.contains("Proposer un acronyme"), "interface contributeur sans actions ni validation");
    f.manager(); html = f.render("WebHome.xwiki", "");
    check(html.contains("glossary-col-actions") && html.contains("btnReviewGlossaryProposals"), "interface validateur avec actions et file");

    f = new Fixture(); f.ordinary(); f.wiki.allowed = false;
    result = f.data("propose", "acronym", "A.B|C", "label", "Une <proposition>", "definition", "</textarea><script>alert(1)</script>",
        "author", "XWiki.Victime", "status", "approved");
    Doc proposal = f.proposal(); Obj object = proposal.getObject(PROPOSAL_CLASS);
    check(result.startsWith("GLOSSAIRE_PROPOSED|") && f.published().isEmpty(), "proposition mise en attente sans publication");
    check(object.getValue("status").equals("pending") && object.getValue("author").equals("XWiki.Test") && object.getValue("submittedAt") instanceof Date,
        "statut et auteur authentifié horodatés côté serveur");
    check(proposal.getObject(CLASS) == null && f.wiki.normalSaves == 0 && f.wiki.authorSaves == 1,
        "stockage isolé : aucune permission d'édition de DATA nécessaire pour proposer");
    html = f.render("WebHome.xwiki", "");
    check(html.contains("Une &lt;proposition&gt;") && !html.contains("<script>") && !html.contains("glossary-col-actions"), "texte de proposition échappé et hors tableau publié");
    check(error(f.data("approve", "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "acronym", "API", "label", "Interface")),
        "non-membre : validation forcée refusée");
    check(error(f.data("reject", "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "comment", "Non")) && object.getValue("status").equals("pending"),
        "non-membre : refus forcé interdit");
    f.manager();
    check(error(approve(f, proposal, "API", "Interface", "Corrigé")) && f.published().isEmpty(), "validateur sans droits XWiki DATA ne peut pas publier");
    f.wiki.allowed = true;
    f.userContext.user = new Ref("XWiki", "Validateur");
    String pendingVersion = proposal.getVersion();
    result = approve(f, proposal, "CORRIGÉ", "Libellé corrigé", "Orthographe corrigée");
    check(result.startsWith("GLOSSAIRE_APPROVED|") && f.published().size() == 1, "validation publie exactement une fiche");
    Doc published = f.published().get(0);
    check(published.getObject(CLASS).getValue("acronyme").equals("CORRIGÉ") && published.getObject(CLASS).getValue("libelle").equals("Libellé corrigé")
        && published.getObject(CLASS).getValue("definition").equals("Définition corrigée"), "validation avec modification publie les champs corrigés");
    check(object.getValue("status").equals("approved") && object.getValue("author").equals("XWiki.Test") && object.getValue("reviewer").equals("XWiki.Validateur")
        && object.getValue("reviewComment").equals("Orthographe corrigée") && object.getValue("publishedRef").equals(published.getFullName())
        && object.getValue("reviewedAt") instanceof Date, "décision et référence publiée conservées avec l'auteur initial");
    check(error(f.data("approve", "targetRef", proposal.getFullName(), "expectedVersion", pendingVersion, "acronym", "DOUBLON", "label", "Interdit"))
        && f.published().size() == 1 && published.getObject(CLASS).getValue("acronyme").equals("CORRIGÉ"), "double validation ne crée aucun doublon");
    check(error(f.data("reject", "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "comment", "Trop tard"))
        && object.getValue("status").equals("approved"), "aucune décision contraire après validation");
    html = f.render("WebHome.xwiki", "");
    check(html.contains("CORRIGÉ") && html.contains("Libellé corrigé") && !html.contains("glossary-proposal-card\""), "fiche approuvée visible dans le tableau et retirée de la file");

    f = new Fixture(); f.ordinary(); f.data("propose", "acronym", "REFUS", "label", "À vérifier"); proposal = f.proposal(); f.manager();
    for (String reason : List.of("", "   ")) {
      result = f.data("reject", "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "comment", reason);
      check(error(result) && proposal.obj.getValue("status").equals("pending"), "motif de refus obligatoire : " + reason);
    }
    result = f.data("reject", "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "comment", "Précisez la définition <merci>");
    check(result.equals("GLOSSAIRE_REJECTED") && f.published().isEmpty() && proposal.obj.getValue("status").equals("rejected"), "refus motivé sans publication");
    f.ordinary(); f.wiki.addProposal("Autre", "SECRET_AUTRE", "rejected", "XWiki.Autre", "CONFIDENTIEL_AUTRE");
    html = f.render("WebHome.xwiki", "");
    check(html.contains("Précisez la définition &lt;merci&gt;") && html.contains("Refusée") && !html.contains("SECRET_AUTRE") && !html.contains("CONFIDENTIEL_AUTRE"),
        "l'auteur voit son refus échappé et aucune proposition d'autrui");

    for (String denied : List.of("guest", "GET", "csrf")) {
      f = new Fixture(); f.ordinary();
      if (denied.equals("guest")) f.userContext.user = null;
      if (denied.equals("GET")) f.request.method = "GET";
      if (denied.equals("csrf")) f.request.params.remove("form_token");
      check(error(f.data("propose", "acronym", "API", "label", "Interface")) && f.wiki.docs.isEmpty(), "proposition bloquée : " + denied);
    }
    for (String action : List.of("approve", "reject")) {
      for (String denied : List.of("guest", "GET", "csrf")) {
        f = new Fixture(); proposal = f.wiki.addProposal("Interdit", "API", "pending", "XWiki.Autre", "");
        if (denied.equals("guest")) f.userContext.user = null;
        if (denied.equals("GET")) f.request.method = "GET";
        if (denied.equals("csrf")) f.request.params.put("form_token", "invalid");
        check(error(f.data(action, "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "acronym", "API", "label", "Interface", "comment", "Motif"))
            && proposal.obj.getValue("status").equals("pending") && f.published().isEmpty(), "décision " + action + " bloquée : " + denied);
      }
    }
    for (String invalid : List.of("", "   ", "A/B", "${danger}", "A".repeat(256))) {
      f = new Fixture(); f.ordinary();
      check(error(f.data("propose", "acronym", invalid, "label", "Interface")) && f.wiki.docs.isEmpty(), "proposition invalide rejetée : " + invalid.length());
    }
    f = new Fixture();
    check(error(f.data("propose", "acronym", "API", "label", "L".repeat(256))) && f.wiki.docs.isEmpty(), "libellé de proposition trop long rejeté");

    f = new Fixture(); proposal = f.wiki.addProposal("Version", "API", "pending", "XWiki.Autre", "");
    check(error(f.data("approve", "targetRef", proposal.getFullName(), "expectedVersion", "0.1", "acronym", "API", "label", "Interface"))
        && f.published().isEmpty(), "décision sur une version périmée rejetée");
    for (String foreign : List.of("Autre.Espace.Page", "autrewiki:" + PROPOSAL_SPACE + ".Version", PROPOSAL_SPACE + ".WebHome", PROPOSAL_SPACE + ".Version.Enfant")) {
      int authorReads = f.wiki.authorReads.size();
      check(error(f.data("approve", "targetRef", foreign, "expectedVersion", proposal.getVersion(), "acronym", "API", "label", "Interface"))
          && f.published().isEmpty() && f.wiki.authorReads.size() == authorReads, "référence étrangère rejetée avant lecture au nom de l'auteur : " + foreign);
    }
    Doc noObject = f.wiki.getDocument(new Ref(PROPOSAL_SPACE, "SansObjet")); noObject.save("", true);
    check(error(f.data("reject", "targetRef", noObject.getFullName(), "expectedVersion", noObject.getVersion(), "comment", "Non")), "page sans objet proposition rejetée");

    f = new Fixture(); proposal = f.wiki.addProposal("Collision", "API", "pending", "XWiki.Autre", "");
    published = f.wiki.add("Proposition_Collision", "EXISTANT");
    check(error(approve(f, proposal, "API", "Interface", "")) && published.obj.getValue("acronyme").equals("EXISTANT") && f.published().size() == 1,
        "destination occupée sans marqueur jamais écrasée");
    published.setContent("{{html}}<!-- glossary-proposal:Collision -->{{/html}}"); published.save("", true);
    check(error(f.data("reject", "targetRef", proposal.getFullName(), "expectedVersion", proposal.getVersion(), "comment", "Non"))
        && proposal.obj.getValue("status").equals("pending"), "publication partielle ne peut pas être refusée");
    check(approve(f, proposal, "MODIFICATION_TARDIVE", "Nouveau", "Reprise").startsWith("GLOSSAIRE_APPROVED|") && f.published().size() == 1
        && proposal.obj.getValue("acronyme").equals("EXISTANT"), "reprise idempotente conserve la fiche déjà publiée");

    f = new Fixture(); Doc configDoc = f.wiki.getDocument(CONFIG_DOC); Obj config = configDoc.newObject(CONFIG_CLASS);
    config.set("reviewGroup", "central:XWiki.Relecteurs"); configDoc.save("", true);
    html = f.render("WebHome.xwiki", "");
    check(!html.contains("btnReviewGlossaryProposals"), "groupe de validation configurable sans rôle implicite");
    source = f.wiki.add("API", "API");
    check(error(f.save(source.getFullName(), "INTERDIT")) && f.refactoring.calls == 0, "groupe configuré contrôle aussi le service DATA");
    f.userServices.group.memberships.add(new Ref("central", "XWiki", "Relecteurs")); html = f.render("WebHome.xwiki", "");
    check(html.contains("btnReviewGlossaryProposals"), "référence de groupe dans un autre wiki reconnue");
    proposal = f.wiki.addProposal("Groupe", "HTTP", "pending", "XWiki.Autre", "");
    check(approve(f, proposal, "HTTP", "Interface", "").startsWith("GLOSSAIRE_APPROVED|"), "groupe configuré contrôle aussi la validation des propositions");
    f = new Fixture(); f.userContext.user = null; html = f.render("WebHome.xwiki", "");
    check(!html.contains("glossary-col-actions") && !html.contains("glossaryProposalsModal") && !html.contains("id=\"glossaryModal\""), "visiteur sans actions ni formulaire de proposition");
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
        && f.published().size() == 1 && imported.obj.getValue("status").equals("approved"), "proposition importée validable avec correction par le circuit existant");

    f = new Fixture(); f.wiki.add("API", "API"); f.ordinary(); f.wiki.allowed = false;
    result = f.importRows(false, false, new String[]{"api", "Autre libellé", "Déjà publié"}, new String[]{"NOUVEAU", "Nouveau libellé", "Définition"},
        new String[]{"nouveau", "Nouveau libellé", "Doublon du fichier"}, new String[]{"A/B", "Invalide", "Interdit"},
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
    f = new Fixture(); f.wiki.allowed = false;
    result = f.importRows(false, false, new String[]{"API", "Interface"});
    check(result.contains("ROW_ERROR|0|") && f.wiki.docs.isEmpty(), "import validateur : les droits natifs de publication restent obligatoires");
  }
  static void inertPageChecks() throws Exception {
    for (String filename : List.of("WebHome.xwiki")) {
      for (String action : List.of("checkAndCreate", "create", "save", "delete", "import", "propose", "approve", "reject")) {
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
    Files.writeString(directory.resolve("glossaire-reviewer.html"), reviewer.render("WebHome.xwiki", ""));
    Fixture reader = new Fixture(); reader.ordinary(); reader.wiki.add("API", "API");
    reader.wiki.addProposal("Refus", "HTTP", "rejected", "XWiki.Test", "Précisez la définition.");
    reader.wiki.addProposal("Autre", "SECRET_AUTRE", "pending", "XWiki.Autre", "CONFIDENTIEL_AUTRE");
    Files.writeString(directory.resolve("glossaire-reader.html"), reader.render("WebHome.xwiki", ""));
    Fixture guest = new Fixture(); guest.userContext.user = null; guest.wiki.add("API", "API");
    Files.writeString(directory.resolve("glossaire-guest.html"), guest.render("WebHome.xwiki", ""));
    String reviewerHtml = reviewer.render("WebHome.xwiki", "");
    check(reviewerHtml.contains(">2</span>") && reviewerHtml.split("class=\"glossary-proposal-card\"", -1).length == 3, "compteur de deux propositions et deux formulaires validateur");
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
    result = f.create("API", "Interface");
    check(result.equals("GLOSSAIRE_OK|TestPage.PAGE.Glossaire.DATA.API|API") && f.published().size() == 1
        && f.published().get(0).obj.getValue("acronyme").equals("API")
        && f.published().get(0).obj.getValue("libelle").equals("Interface")
        && f.published().get(0).obj.getValue("definition").equals("Définition créée"), "création validateur via DATA avec référence canonique");
    for (String invalid : List.of("", "   ", "A/B", "${danger}", "A".repeat(256))) {
      f = new Fixture(); result = f.create(invalid, "Interface");
      check(f.wiki.docs.isEmpty() && error(result), "création invalide : " + invalid);
    }
    f = new Fixture();
    check(error(f.create("API", "L".repeat(256))) && f.wiki.docs.isEmpty(), "création : libellé trop long rejeté");
    f = new Fixture(); occupied = f.wiki.add("API", "EXISTANT");
    check(f.create("API", "Interface").equals("GLOSSAIRE_OK|TestPage.PAGE.Glossaire.DATA.API_1|API_1")
        && f.published().size() == 2 && occupied.obj.getValue("acronyme").equals("EXISTANT"), "création : collision conservée avec suffixe disponible");
    f = new Fixture(); Doc nested = f.wiki.getDocument(new Ref(SPACE + ".API", "WebHome")); nested.setTitle("Page existante"); nested.save("", false);
    check(f.create("API", "Interface").endsWith("|API_1") && f.wiki.docs.size() == 2 && !nested.isNew() && nested.title.equals("Page existante"),
        "création : page non terminale existante conservée");
    f = new Fixture(); Ref special = new Ref(SPACE, "A.B|C +%"); result = f.create(special.name, "Interface");
    check(result.equals("GLOSSAIRE_OK|" + new Escape().url(special.toString()) + "|" + new Escape().url(special.name))
        && f.wiki.docs.containsKey(special) && f.published().size() == 1, "création : point, séparateur et caractères URL conservent une référence typée");
    for (String denied : List.of("guest", "GET", "csrf", "rights")) {
      f = new Fixture();
      if (denied.equals("guest")) f.userContext.user = null;
      if (denied.equals("GET")) f.request.method = "GET";
      if (denied.equals("csrf")) f.request.params.remove("form_token");
      if (denied.equals("rights")) f.wiki.allowed = false;
      check(error(f.create("API", "Interface")) && f.wiki.docs.isEmpty(), "création bloquée : " + denied);
    }
    f = new Fixture();
    for (int i = 0; i < 100; i++) f.wiki.add(i == 0 ? "API" : "API_" + i, "API");
    result = f.create("API", "Interface");
    check(f.wiki.docs.size() == 100 && error(result), "épuisement des noms de création");
    f = new Fixture(); source = f.wiki.add("A.B", "A.B"); source.obj.set("libelle", "<img src=x onerror=alert(1)>"); source.obj.set("definition", "</textarea><script>alert(1)</script>");
    String html = f.render("WebHome.xwiki", "");
    check(html.contains("A.B") && html.contains("&lt;img") && !html.contains("<script>"), "affichage échappé et nom contenant un point");
    if (args.length > 0) Files.writeString(Path.of(args[0]), html);
    f = new Fixture();
    result = f.data("import", "acronym_0", "A.B", "label_0", "Interface", "definition_0", "<texte>", "acronym_1", "A.B", "label_1", "Interface");
    check(result.contains("ROW_OK|0|") && result.contains("ROW_SKIP|1|") && f.wiki.docs.size() == 1, "import et doublons : " + result);
    dataChecks();
    importChecks();
    inertPageChecks();
    if (args.length > 0) writeWorkflowFixtures(Path.of(args[0]).toAbsolutePath().getParent());
    System.out.println(checks + " vérifications Velocity réussies.");
  }
}
