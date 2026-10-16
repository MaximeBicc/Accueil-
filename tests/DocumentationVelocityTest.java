import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.SimpleDateFormat;
import java.util.*;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.VelocityEngine;

/** Executes complete, unmodified documentation templates with a small simulated XWiki API.
 * Run from the repository root: java -cp '/path/to/velocity-jars/*' tests/DocumentationVelocityTest.java
 * Required jars: Velocity 2.3, commons-lang3, slf4j-api.
 * This exercises Velocity and permission decisions, not a deployed XWiki server.
 */
public class DocumentationVelocityTest {
  static final Path ROOT = Path.of("xwiki/TestPage/PAGE/doc-test");
  static final String CONFIG_CLASS = "TestPage.PAGE.doc-test.CODE.docConfigurationClass.WebHome";
  static final String PROPOSAL_CLASS = "TestPage.PAGE.doc-test.CODE.docPropositionClass.WebHome";
  static final String DOCUMENT_CLASS = "TestPage.PAGE.Doc.CODE.docClass.WebHome";
  static final String CONTENT_CLASS = "TestPage.PAGE.doc-test.CODE.docContentClass.WebHome";
  static final String CONTENT_RENDERER = "TestPage.PAGE.doc-test.CODE.DocumentContent";
  static final String MAIN = "TestPage.PAGE.doc-test.WebHome";
  static final String PROPOSALS = "TestPage.PAGE.doc-test.PROPOSITIONS";
  static final String TRASH = "TestPage.PAGE.doc-test.CORBEILLE";
  static final long NOW = 1792137600000L, WEEK = 604800000L;
  static final String POLICY_START = "## Début du calcul des autorisations (identique dans WebHome et COMMANDE).";
  static final String POLICY_END = "## Fin du calcul des autorisations.";
  static int scenarios;

  public static class WikiRef {
    final String name;
    WikiRef(String name) { this.name = name; }
    public String getName() { return name; }
  }
  public static class Ref {
    final String wiki, fullName;
    Ref(String wiki, String fullName) { this.wiki = wiki; this.fullName = fullName; }
    public String getName() { return fullName.substring(fullName.lastIndexOf('.') + 1); }
    public WikiRef getWikiReference() { return new WikiRef(wiki); }
    public String toString() { return (wiki.equals("xwiki") ? "" : wiki + ":") + fullName; }
    public boolean equals(Object other) { return other instanceof Ref r && wiki.equals(r.wiki) && fullName.equals(r.fullName); }
    public int hashCode() { return Objects.hash(wiki, fullName); }
  }
  public static class Model {
    public Ref resolveDocument(String text) {
      int colon = text.indexOf(':');
      return colon < 0 ? new Ref("xwiki", text) : new Ref(text.substring(0, colon), text.substring(colon + 1));
    }
    public String serialize(Ref ref) { return ref.toString(); }
    public String serialize(Ref ref, String hint) { return serialize(ref); }
  }
  public static class Obj {
    final Map<String, Object> fields = new LinkedHashMap<>();
    final Schema schema;
    Obj() { this(null); }
    Obj(Schema schema) { this.schema = schema; }
    public Object getValue(String name) { return fields.get(name); }
    public PropertyValue getProperty(String name) { return fields.containsKey(name) ? new PropertyValue(fields.get(name)) : null; }
    public Schema getxWikiClass() { return schema; }
    public void set(String name, Object value) {
      // BaseObject.set() silently ignores unknown definitions; DateProperty stores a plain Date.
      if (schema != null && !schema.properties.containsKey(name)) return;
      fields.put(name, value instanceof Date date ? new Date(date.getTime()) : value);
    }
  }
  public static class PropertyValue {
    final Object value;
    PropertyValue(Object value) { this.value = value; }
    public Object getValue() { return value; }
  }
  public static class Definition {
    final String type;
    boolean disabled;
    Definition(String type) { this.type = type; }
    public String getClassType() { return type; }
  }
  public static class Schema {
    final Map<String, Definition> properties = new LinkedHashMap<>();
    Schema() {
      for (String name : List.of("operation", "type", "title", "parentRef", "parentProposalRef", "sourceRef", "baseVersion", "content", "description", "tags", "author", "submittedAt", "status", "reviewer", "reviewComment", "reviewedAt", "deletedAt", "publishedRef", "batchId", "filename", "kind", "sourceProposalId")) {
        String type = List.of("submittedAt", "reviewedAt", "deletedAt").contains(name) ? "Date" : List.of("content", "description", "tags", "reviewComment").contains(name) ? "TextArea" : "String";
        properties.put(name, new Definition(type));
      }
    }
    Schema(String field, String type) { properties.put(field, new Definition(type)); }
    public Definition get(String name) { return properties.get(name); }
    public List<String> getEnabledPropertyNames() { return properties.entrySet().stream().filter(entry -> !entry.getValue().disabled).map(Map.Entry::getKey).toList(); }
  }
  public static class Doc {
    final Obj configuration = new Obj();
    final Map<String, List<Obj>> objects = new LinkedHashMap<>();
    final Wiki owner; String reference;
    final Map<String, byte[]> attachments = new LinkedHashMap<>();
    String content = "", title = "", parent = ""; int revision;
    boolean configurationObjectPresent = true;
    Doc() { this(null, "TestPage.PAGE.doc-test.CODE.Configuration.WebHome"); }
    Doc(Wiki owner, String reference) { this.owner = owner; this.reference = reference; }
    public Obj getObject(String name) { return name.equals(CONFIG_CLASS) ? configurationObjectPresent ? configuration : null : objects.getOrDefault(name, List.of()).stream().findFirst().orElse(null); }
    public Obj newObject(String name) {
      if (name.equals(CONFIG_CLASS)) { configurationObjectPresent = true; return configuration; }
      Obj value = new Obj(name.equals(PROPOSAL_CLASS) ? owner.proposalSchema : name.equals(CONTENT_CLASS) ? owner.contentSchema : null); objects.computeIfAbsent(name, ignored -> new ArrayList<>()).add(value); return value;
    }
    public List<Obj> getObjects(String name) { return new ArrayList<>(objects.getOrDefault(name, List.of())); }
    public boolean removeObject(Obj value) { return objects.values().stream().anyMatch(values -> values.remove(value)); }
    public boolean isNew() { return owner != null && !owner.docs.containsKey(reference); }
    public String getName() { return reference.substring(reference.lastIndexOf('.') + 1); }
    public String getFullName() { return reference; }
    public Ref getDocumentReference() { return new Ref("xwiki", reference); }
    public Ref getContentAuthorReference() { return new Ref("xwiki", "XWiki.ScriptAuthor"); }
    public String getContentAuthor() { return "XWiki.ScriptAuthor"; }
    public String getContent() { return content; }
    public void setContent(String value) { content = value; }
    public String getDisplayTitle() { return title; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public List<String> getChildren() {
      return owner.docs.values().stream().filter(value -> value.parent.equals(reference)).map(value -> value.reference).toList();
    }
    public String getParent() { return parent; }
    public void setParent(String value) { parent = value; }
    public String getVersion() { return Math.max(1, revision) + ".1"; }
    public List<Attachment> getAttachmentList() { return attachments.entrySet().stream().map(entry -> new Attachment(entry.getKey(), entry.getValue())).toList(); }
    public void addAttachment(String filename, java.io.InputStream stream) throws Exception { attachments.put(filename, stream.readAllBytes()); }
    public void addAttachment(String filename, byte[] bytes) { attachments.put(filename, bytes); }
    public void saveAsAuthor(String comment, boolean minor) { revision++; owner.docs.put(reference, this); }
    public void deleteAsAuthor() { owner.deleted.add(reference); owner.docs.remove(reference); }
    public String getURL(String action) { return "/xwiki/bin/" + action + "/" + reference; }
    public String getURL(String action, String query) { return getURL(action) + "?" + query; }
  }
  public static class TrashDoc extends Doc {
    final Wiki owner; final String name; final Obj proposal = new Obj();
    TrashDoc(Wiki owner, String name, String status, Long deletedAt) {
      super(owner, name); this.owner = owner; this.name = name;
      proposal.set("status", status); if (deletedAt != null) proposal.set("deletedAt", new Date(deletedAt));
      proposal.set("author", "XWiki.Alice"); proposal.set("submittedAt", new Date(NOW)); proposal.set("title", name);
    }
    public Obj getObject(String className) { return className.equals(PROPOSAL_CLASS) ? proposal : null; }
    public void deleteAsAuthor() { owner.deleted.add(name); owner.docs.remove(name); }
    public String getVersion() { return "1.1"; }
    public String getURL(String action) { return "/xwiki/bin/" + action + "/" + name; }
    public String getURL(String action, String query) { return getURL(action) + "?" + query; }
  }
  public static class Wiki {
    final Schema proposalSchema = new Schema();
    final Schema contentSchema = new Schema("source", "TextArea");
    final Doc config = new Doc(this, "TestPage.PAGE.doc-test.CODE.Configuration.WebHome");
    final Map<String, Doc> docs = new LinkedHashMap<>();
    final List<String> deleted = new ArrayList<>();
    final Upload upload = new Upload();
    int unique;
    boolean admin, serviceAdmin = true, visible = true, nativeEdit, nativeDelete, readableConfiguration = true, configurationExists = true;
    boolean rendererAvailable = true, rendererEmpty;
    final Set<String> hiddenRefs = new HashSet<>();
    public Extensions getJsx() { return new Extensions(); }
    public Extensions getSsx() { return new Extensions(); }
    public Upload getFileupload() { return upload; }
    public boolean hasWikiAdminRights() { return admin; }
    public boolean hasAccessLevel(String level, String user, String ref) {
      return switch (level) { case "admin" -> user.equals("XWiki.ScriptAuthor") ? serviceAdmin : admin; case "view" -> visible && !hiddenRefs.contains(ref); case "edit" -> nativeEdit; case "delete" -> nativeDelete; default -> false; };
    }
    public Doc getDocumentAsAuthor(String ref) {
      if (ref.equals(CONTENT_RENDERER) && rendererAvailable) {
        Doc renderer = new Doc(null, CONTENT_RENDERER); renderer.content = rendererEmpty ? "  \n" : "{{velocity}}renderer{{/velocity}}"; return renderer;
      }
      if (ref.equals("TestPage.PAGE.doc-test.CODE.Configuration.WebHome")) {
        if (!readableConfiguration) return null;
        if (configurationExists) return config;
        Doc missing = new Doc(this, ref); missing.configurationObjectPresent = false; return missing;
      }
      return docs.getOrDefault(ref, new Doc(this, ref));
    }
    public Doc getDocumentAsAuthor(Ref ref) { return getDocumentAsAuthor(ref.toString()); }
    public Doc getDocument(String ref) { return getDocumentAsAuthor(ref); }
    public Doc getDocument(Ref ref) { return getDocumentAsAuthor(ref); }
    public String getUniquePageName(String space) { return "P" + (++unique); }
    public String formatDate(Date value, String format) { return new SimpleDateFormat(format).format(value); }
    public String getURL(String reference, String action) { return "/xwiki/bin/" + action + "/" + reference; }
  }
  public static class Attachment {
    final String filename; final byte[] bytes;
    Attachment(String filename, byte[] bytes) { this.filename = filename; this.bytes = bytes; }
    public String getFilename() { return filename; }
    public byte[] getContent() { return bytes; }
    public java.io.InputStream getContentInputStream() { return new java.io.ByteArrayInputStream(bytes); }
  }
  public static class Upload {
    int loads;
    public void loadFileList() { loads++; }
    public List<FileItem> getFileItems() { return List.of(new FileItem()); }
  }
  public static class FileItem {
    final byte[] bytes = "Fichier de test".getBytes(java.nio.charset.StandardCharsets.UTF_8);
    public String getFieldName() { return "filePath"; }
    public int getSize() { return bytes.length; }
    public java.io.InputStream getInputStream() { return new java.io.ByteArrayInputStream(bytes); }
  }
  public static class RefactoringRequest {
    final List<Ref> sources; final Ref target;
    boolean deep;
    RefactoringRequest(List<Ref> sources, Ref target) { this.sources = sources; this.target = target; }
    public void setDeep(boolean value) { deep = value; }
    public void setUpdateLinks(boolean value) { }
    public void setAutoRedirect(boolean value) { }
    public void setUpdateParentField(boolean value) { }
  }
  public static class RequestFactory {
    public RefactoringRequest createDeleteRequest(List<Ref> sources) { return new RefactoringRequest(sources, null); }
    public RefactoringRequest createRenameRequest(Ref source, Ref target) { return new RefactoringRequest(List.of(source), target); }
  }
  public static class Refactoring {
    final Wiki wiki;
    int deleteCalls, moveCalls;
    boolean failDelete, partialMove, partialDelete;
    Refactoring(Wiki wiki) { this.wiki = wiki; }
    public RequestFactory getRequestFactory() { return new RequestFactory(); }
    public RefactoringJob delete(RefactoringRequest request) { deleteCalls++; return new RefactoringJob(this, request); }
    public RefactoringJob rename(RefactoringRequest request) { moveCalls++; return new RefactoringJob(this, request); }
  }
  public static class RefactoringJob {
    final Refactoring service; final RefactoringRequest request;
    final JobStatus status = new JobStatus();
    RefactoringJob(Refactoring service, RefactoringRequest request) { this.service = service; this.request = request; }
    public JobStatus getStatus() { return status; }
    public void join() {
      if (request.target == null && service.failDelete) return;
      String from = request.sources.get(0).toString(), prefix = from.substring(0, from.length() - 8) + ".";
      for (Doc value : new ArrayList<>(service.wiki.docs.values())) {
        if (!value.reference.equals(from) && (!request.deep || !value.reference.startsWith(prefix))) continue;
        if (request.target != null && service.partialMove && !value.reference.equals(from)) { status.events.add(new LogEvent("ERROR")); continue; }
        if (request.target == null) {
          if (service.partialDelete && !value.reference.equals(from)) { status.events.add(new LogEvent("ERROR")); continue; }
          value.deleteAsAuthor();
        }
        else {
          service.wiki.docs.remove(value.reference);
          String target = request.target.toString(), targetPrefix = target.substring(0, target.length() - 8) + ".";
          String targetSpace = target.substring(0, target.length() - 8);
          String targetParent = targetSpace.substring(0, targetSpace.lastIndexOf('.')) + ".WebHome";
          value.reference = value.reference.equals(from) ? target : targetPrefix + value.reference.substring(prefix.length());
          value.parent = value.parent.equals(from) ? target : value.parent.startsWith(prefix) ? targetPrefix + value.parent.substring(prefix.length()) : targetParent;
          service.wiki.docs.put(value.reference, value);
        }
      }
    }
  }
  public static class JobStatus {
    final List<LogEvent> events = new ArrayList<>();
    public Object getError() { return null; }
    public List<LogEvent> getLogTail() { return events; }
  }
  public static class LogEvent {
    final String level;
    LogEvent(String level) { this.level = level; }
    public String getLevel() { return level; }
  }
  public static class Extensions {
    public boolean use(String reference) { return true; }
  }
  public static class UserContext {
    Ref user = new Ref("xwiki", "XWiki.Alice");
    public Ref getUserReference() { return user; }
    public String getUser() { return user.toString(); }
  }
  public static class DateTool {
    Date now = new Date(NOW);
    public Date getDate() { return now; }
    public Date toDate(long value) { return new Date(value); }
    public Calendar toCalendar(Date value) { Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC")); calendar.setTime(value); return calendar; }
  }
  public static class Groups {
    final Set<Ref> members = new LinkedHashSet<>();
    final List<String> wikiLookups = new ArrayList<>();
    public Collection<Ref> getGroups(Ref user, WikiRef wiki, boolean recursive) {
      if (!recursive) throw new AssertionError("Nested groups must be included");
      wikiLookups.add(wiki.name);
      return members.stream().filter(ref -> ref.wiki.equals(wiki.name)).toList();
    }
  }
  public static class Users {
    final Groups group = new Groups();
    public Groups getGroup() { return group; }
  }
  public static class Queries {
    final Wiki wiki;
    String query = ""; int limit;
    final Map<String, Object> parameters = new HashMap<>();
    Queries(Wiki wiki) { this.wiki = wiki; }
    public Queries hql(String query) { this.query = query; parameters.clear(); limit = 0; return this; }
    public Queries bindValue(String name, Object value) { parameters.put(name, value); return this; }
    public Queries setLimit(int value) { limit = value; return this; }
    public List<String> execute() {
      if (!parameters.containsKey("deletionSpace")) return new ArrayList<>(wiki.docs.keySet());
      String space = String.valueOf(parameters.get("deletionSpace"));
      return wiki.docs.keySet().stream().filter(ref -> {
        String candidateSpace = ref.substring(0, ref.lastIndexOf('.'));
        return candidateSpace.equals(space) || candidateSpace.startsWith(space + ".");
      }).sorted().limit(limit > 0 ? limit : Long.MAX_VALUE).toList();
    }
  }
  public static class Request {
    String action = "", method = "GET";
    final Map<String, String> params = new HashMap<>();
    public String getParameter(String name) { return name.equals("action") ? action : params.getOrDefault(name, ""); }
    public String getMethod() { return method; }
  }
  public static class Escape {
    public String xml(Object value) { return String.valueOf(value).replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;"); }
    public String velocity(String value) { return value.replace("$", "${escapetool.d}").replace("#", "${escapetool.h}"); }
    public String javascript(String value) { return value.replace("\\", "\\\\").replace("\"", "\\\""); }
    public String getD() { return "$"; }
    public String getH() { return "#"; }
  }
  public static class Csrf {
    public boolean isTokenValid(String value) { return value.equals("test-token"); }
    public String getToken() { return "test-token"; }
  }
  public static class Strings {
    public String join(Collection<?> values, String separator) { return String.join(separator, values.stream().map(String::valueOf).toList()); }
  }
  public static class Fixture {
    final Wiki wiki = new Wiki();
    final UserContext user = new UserContext();
    final Users users = new Users();
    final Model model = new Model();
    final Request request = new Request();
    final DateTool dates = new DateTool();
    final Refactoring refactoring = new Refactoring(wiki);
    VelocityContext context;
    VelocityEngine engine;
    String pageOutput;
    void configured() { wiki.config.configuration.set("schemaVersion", "1"); }
    void group(String field, String reference) {
      wiki.config.configuration.set(field, reference);
      users.group.members.add(model.resolveDocument(reference));
    }
    void initContext(String page) {
      // Each page/request starts with no preloaded macro library or previous request state.
      engine = new VelocityEngine();
      engine.setProperty("velocimacro.library", "");
      engine.init();
      context = new VelocityContext();
      context.put("xwiki", wiki); context.put("xcontext", user); context.put("datetool", dates);
      context.put("services", Map.of("model", model, "user", users, "query", new Queries(wiki), "csrf", new Csrf(), "refactoring", refactoring));
      context.put("request", request); context.put("escapetool", new Escape());
      context.put("doc", new Doc(wiki, page.equals("WebHome.xwiki") ? MAIN : "TestPage.PAGE.doc-test.COMMANDE"));
      context.put("stringtool", new Strings());
    }
    String renderPage(String page) throws Exception {
      initContext(page);
      String source = Files.readString(ROOT.resolve(page));
      java.util.regex.Matcher blocks = java.util.regex.Pattern.compile("\\{\\{velocity([^}]*)}}(.*?)\\{\\{/velocity}}", java.util.regex.Pattern.DOTALL).matcher(source);
      StringBuilder result = new StringBuilder(); int blockCount = 0;
      while (blocks.find()) {
        StringWriter output = new StringWriter();
        // Preserve the shared context between the page's original Velocity blocks.
        engine.evaluate(context, output, page, blocks.group(2));
        if (!blocks.group(1).contains("output=\"false\"")) result.append(output);
        blockCount++;
      }
      check(blockCount == (page.equals("COMMANDE.xwiki") ? 2 : 1), "Unexpected Velocity block count in " + page);
      pageOutput = result.toString();
      return pageOutput;
    }
    void render() throws Exception { renderPage("WebHome.xwiki"); }
    boolean can(String right) { return Boolean.TRUE.equals(context.get("can" + right)); }
    void trash(String ref, String status, Long deletedAt) { wiki.docs.put(ref, new TrashDoc(wiki, ref, status, deletedAt)); }
    void purge() throws Exception {
      commandMacros();
      evaluateCommand("#purgeExpiredProposals()");
    }
    void commandMacros() throws Exception {
      renderPage("COMMANDE.xwiki");
    }
    void evaluateCommand(String source) { engine.evaluate(context, new StringWriter(), "COMMANDE.xwiki", source); }
    String list(String action) throws Exception {
      request.action = action; request.method = "GET";
      return renderPage("COMMANDE.xwiki");
    }
    String deletionSnapshot(String ref) throws Exception {
      request.params.clear(); request.params.put("source_ref", ref);
      list("apercu suppression");
      check(Boolean.TRUE.equals(context.get("deletionComplete")), "Deletion preview must be exhaustive for " + ref + ": " + context.get("deletionMessage"));
      return String.valueOf(context.get("deletionSnapshot"));
    }
    String post(String action, String... pairs) throws Exception {
      request.action = action; request.method = "POST"; request.params.clear(); request.params.put("form_token", "test-token");
      for (int index = 0; index < pairs.length; index += 2) request.params.put(pairs[index], pairs[index + 1]);
      renderPage("COMMANDE.xwiki");
      return String.valueOf(context.get("errorCode")).isEmpty() ? String.valueOf(context.get("resultCode")) : String.valueOf(context.get("errorCode"));
    }
    Doc document(String ref, String type, String title) {
      Doc value = new Doc(wiki, ref); Obj metadata = value.newObject(DOCUMENT_CLASS);
      metadata.set("type", type); value.title = title; value.parent = MAIN; value.saveAsAuthor("Fixture", true); return value;
    }
  }

  static void check(boolean valid, String label) { if (!valid) throw new AssertionError(label); }
  static void done(String label) { scenarios++; System.out.println("PASS: " + label); }
  static String policy(String source) {
    int first = source.indexOf(POLICY_START), last = source.indexOf(POLICY_END);
    check(first >= 0 && last > first, "The permission calculation must be present directly in each entry page");
    return source.substring(first, last + POLICY_END.length());
  }
  static void denyWrites(Fixture f) {
    for (String right : List.of("Create", "Move", "Modify", "Import", "Content", "Propose", "Review", "Delete"))
      check(!f.can(right), "Unexpected permission: " + right);
  }
  static final String GUIDE = "TestPage.PAGE.doc-test.Guide.WebHome";
  static final String TARGET = "TestPage.PAGE.doc-test.Cible.WebHome";
  record OperationCase(String label, String grant, String action, String expected, String[] parameters) { }
  static Fixture operationFixture(String... grants) {
    Fixture f = new Fixture(); f.configured(); f.wiki.nativeEdit = true; f.wiki.nativeDelete = true;
    for (String grant : grants) f.group(grant, "XWiki." + grant);
    f.document(MAIN, "root", "Documentation");
    f.document(TARGET, "folder", "Cible");
    Doc source = f.document(GUIDE, "document", "Guide"); source.content = "Contenu original";
    source.getObject(DOCUMENT_CLASS).set("nom", "Guide");
    return f;
  }
  static String[] withMode(OperationCase operation, String mode) {
    List<String> values = new ArrayList<>(Arrays.asList(operation.parameters));
    if (!mode.isEmpty()) { values.add("mode"); values.add(mode); }
    return values.toArray(String[]::new);
  }
  static Map<String, Integer> revisions(Fixture f) {
    Map<String, Integer> values = new LinkedHashMap<>();
    f.wiki.docs.forEach((reference, value) -> values.put(reference, value.revision));
    return values;
  }
  static String stage(Fixture f, String action, String... pairs) throws Exception {
    String result = f.post(action, pairs);
    check(result.equals("PROPOSITION_OK"), "Proposal fixture must be staged: " + result);
    return String.valueOf(f.context.get("resultProposalRef"));
  }
  static String amend(Fixture f, String ref, String title, String parent, String parentProposal) throws Exception {
    return f.post("modifier proposition", "proposal_ref", ref, "version", f.wiki.docs.get(ref).getVersion(), "title", title, "parent_ref", parent, "parent_proposal_ref", parentProposal);
  }
  static void invalidOrEmptyConfiguration(Fixture f, String state) {
    switch (state) {
      case "missing page" -> f.wiki.configurationExists = false;
      case "missing object" -> f.wiki.config.configurationObjectPresent = false;
      case "empty lists" -> f.configured();
      case "empty version" -> f.wiki.config.configuration.set("schemaVersion", "");
      case "unknown version" -> f.wiki.config.configuration.set("schemaVersion", "999");
      case "inaccessible" -> f.wiki.readableConfiguration = false;
      default -> throw new IllegalArgumentException(state);
    }
  }
  static void nativeXWikiProperties() throws Exception {
    // Optional native contract check: add XWiki oldcore and its runtime jars to the classpath.
    java.lang.Class<?> dateType = java.lang.Class.forName("com.xpn.xwiki.objects.DateProperty");
    Object property = dateType.getConstructor().newInstance();
    java.sql.Timestamp submitted = new java.sql.Timestamp(NOW + 123);
    dateType.getMethod("setValue", Object.class).invoke(property, submitted);
    Date stored = (Date) dateType.getMethod("getValue").invoke(property);
    check(stored.getClass() == Date.class && stored.getTime() == submitted.getTime(), "Native DateProperty must preserve Timestamp milliseconds as a Date");
    check(!stored.toString().equals(submitted.toString()), "The old string comparison must fail on the native date conversion");
    done("Native XWiki DateProperty preserves Timestamp milliseconds while changing its string representation");
  }
  public static void main(String[] args) throws Exception {
    if (Boolean.getBoolean("documentation.nativeProperties")) nativeXWikiProperties();
    String homeSource = Files.readString(ROOT.resolve("WebHome.xwiki"));
    String commandSource = Files.readString(ROOT.resolve("COMMANDE.xwiki"));
    check(policy(homeSource).equals(policy(commandSource)), "Home and server must calculate identical permissions");
    for (String source : List.of(homeSource, commandSource)) {
      check(!source.contains("CODE.Permissions") && !source.contains("#documentationPermissions") && !source.contains("#includeMacros"),
        "Permissions must be calculated without an external page or macro prelude");
    }
    check(!Files.exists(ROOT.resolve("CODE/Permissions.xwiki")), "The obsolete permissions macro page must not be required for installation");
    done("Home and COMMANDE contain identical permission calculations with no external macro dependency");

    Fixture boot = new Fixture(); boot.wiki.admin = true;
    // Membership is evaluated by XWiki's native admin API, not a production group-name special case.
    boot.users.group.members.add(boot.model.resolveDocument("XWiki.IVQ_Gestionnaires"));
    boot.render();
    check(boot.pageOutput.contains("id=\"box\"") && boot.pageOutput.contains("id=\"doc-settings\""), "A native administrator must see the explorer and settings on the real first page render");
    check(!boot.pageOutput.contains("Vous devez être connecté") && !boot.pageOutput.contains("#documentationPermissions"), "A valid administrator cannot receive the false connection warning");
    check(boot.pageOutput.contains("value=\"test-token\""), "The complete page must render the real CSRF form token");
    String workflow = boot.list("workflow");
    check(workflow.contains("data-can-configure=\"true\"") && workflow.contains("data-can-create=\"false\""), "COMMANDE must recognize native administrator settings rights without granting unconfigured actions");
    denyWrites(boot);
    done("Fresh complete renders recognize an IVQ_Gestionnaires administrator for settings while denying unconfigured actions");

    boot = new Fixture(); boot.wiki.nativeEdit = true; boot.render();
    check(boot.pageOutput.contains("id=\"box\"") && !boot.pageOutput.contains("id=\"doc-settings\""), "An authorized editor must see the explorer without administrator settings");
    workflow = boot.list("workflow");
    check(workflow.contains("data-can-configure=\"false\"") && workflow.contains("data-can-create=\"false\""), "Native edit permission cannot grant an unconfigured documentation action");
    denyWrites(boot);
    done("Fresh complete editor renders show the explorer without settings or unconfigured action rights");

    boot = new Fixture(); boot.user.user = new Ref("xwiki", "XWiki.XWikiGuest"); boot.render();
    check(boot.pageOutput.contains("Vous devez être connecté") && !boot.pageOutput.contains("id=\"box\""), "An anonymous user must still receive the connection warning");
    check(boot.post("enregistrer parametres", "expectedVersion", "1.1").equals("ERREUR_DROITS"), "Guests cannot modify settings through COMMANDE");
    done("Fresh anonymous page and server requests retain the connection and write restrictions");

    boot = new Fixture(); boot.wiki.visible = false; boot.render();
    check(boot.pageOutput.contains("Vous devez être connecté") && !boot.pageOutput.contains("id=\"box\""), "A logged-in user without view permission cannot see the explorer");
    workflow = boot.list("workflow");
    check(workflow.contains("ERREUR_DROITS") && !workflow.contains("id=\"documentation-permissions\""), "The server must enforce native view denial independently");
    done("Fresh complete renders enforce native view denial for authenticated users");

    boot = new Fixture(); boot.wiki.admin = true;
    String saved = boot.post("enregistrer parametres", "expectedVersion", "1.1");
    check(saved.equals("PARAMETRES_OK"), "A native administrator must be able to save settings: " + saved);
    check(boot.pageOutput.contains("PARAMETRES_OK"), "The real complete server response must expose the successful result");
    boot.wiki.admin = false;
    check(boot.post("enregistrer parametres", "expectedVersion", boot.wiki.config.getVersion()).equals("ERREUR_DROITS"), "Non-administrators cannot save settings by forging a request");
    done("Fresh complete settings POST accepts native administrators and rejects ordinary users");

    Fixture f;
    for (boolean administrator : List.of(false, true)) {
      for (String configuration : List.of("missing page", "missing object", "empty lists", "empty version", "unknown version", "inaccessible")) {
        f = new Fixture(); f.wiki.admin = administrator; f.wiki.nativeEdit = true; f.wiki.nativeDelete = true;
        invalidOrEmptyConfiguration(f, configuration);
        // Even matching group lists are ignored without a readable, recognized schema.
        if (!configuration.equals("empty lists"))
          for (String field : List.of("createGroups", "moveGroups", "modifyGroups", "importGroups", "contentGroups", "proposeGroups", "reviewGroups", "deleteGroups"))
            f.group(field, "XWiki.IVQ_Gestionnaires");
        f.render();
        check(f.can("View") && f.can("Configure") == administrator, "Native view and settings must remain independent from action grants");
        denyWrites(f);
        for (String id : List.of("doc-add-folder", "doc-add-document")) {
          java.util.regex.Matcher button = java.util.regex.Pattern.compile("<button\\b(?=[^>]*id=\"" + id + "\")[^>]*>").matcher(f.pageOutput);
          check(button.find() && java.util.regex.Pattern.compile("\\s+hidden(?:\\s|=|>)").matcher(button.group()).find(),
            "Unconfigured creation controls must exist but remain hidden until workflow permissions load: " + id);
        }
        workflow = f.list("workflow");
        denyWrites(f);
        for (String right : List.of("create", "move", "modify", "import", "content", "propose", "review", "delete"))
          check(workflow.contains("data-can-" + right + "=\"false\""), "The server cannot expose an unconfigured action as allowed: " + right);
        done((administrator ? "Native administrator" : "Native editor") + " receives no action grants with " + configuration);
      }
    }

    f = new Fixture(); f.wiki.admin = true; f.configured(); f.group("createGroups", "XWiki.Creators"); f.render();
    check(f.can("Configure") && f.can("Create") && !f.can("Propose") && !f.can("Delete") && !f.can("Review"), "Administrators must receive only explicitly assigned action rights");
    done("Administrator settings rights and one explicit create grant do not grant proposal, deletion or validation");

    f = new Fixture(); f.configured(); f.group("createGroups", "XWiki.Creators"); f.group("proposeGroups", "XWiki.Contributors"); f.render();
    check(f.can("Create") && f.can("Propose"), "Configured membership not used");
    check(!f.can("Content") && !f.can("Move") && !f.can("Import") && !f.can("Modify") && !f.can("Review") && !f.can("Configure"), "Rights must remain independent");
    check(f.users.group.wikiLookups.equals(List.of("xwiki")), "Groups should be cached per wiki during one policy evaluation");
    done("Group permissions are independent and use recursive membership");

    f = new Fixture(); f.configured(); f.group("reviewGroups", "xwiki:XWiki.Reviewers"); f.group("contentGroups", "intranet:XWiki.Writers"); f.render();
    check(f.can("Review") && f.can("Content") && !f.can("Configure"), "Cross-wiki configured groups failed");
    check(new HashSet<>(f.users.group.wikiLookups).equals(Set.of("xwiki", "intranet")), "Group membership must use each group wiki");
    done("Cross-wiki groups are resolved in their own wiki");

    f = new Fixture(); f.configured(); f.wiki.nativeEdit = true; f.render();
    denyWrites(f); done("A configured empty rights list denies writes even to a native editor");

    f = new Fixture(); f.configured(); f.group("createGroups", "XWiki.Creators"); f.user.user = new Ref("xwiki", "XWiki.XWikiGuest"); f.render();
    denyWrites(f); done("Guests cannot gain proposal or write rights through groups");

    f = new Fixture(); f.configured(); f.group("reviewGroups", "XWiki.Reviewers"); f.wiki.visible = false; f.render();
    denyWrites(f); done("View permission is required before group grants are applied");

    f = new Fixture(); f.wiki.nativeEdit = true; f.wiki.readableConfiguration = false; f.render();
    denyWrites(f); done("An unreadable configuration fails closed");

    f = new Fixture(); f.wiki.config.configuration.set("schemaVersion", "999"); f.wiki.nativeEdit = true; f.render();
    denyWrites(f); done("An unknown configuration version fails closed");

    check(((Number)f.context.get("trashCutoff")).longValue() == NOW - WEEK, "Seven-day cutoff must use exact milliseconds");
    done("Trash cutoff is exactly seven days");

    f = new Fixture();
    f.trash(TRASH + ".Older", "rejected", NOW - WEEK - 1);
    f.trash(TRASH + ".AtBoundary", "rejected", NOW - WEEK);
    f.trash(TRASH + ".StillVisible", "rejected", NOW - WEEK + 1);
    f.trash(TRASH + ".Recent", "rejected", NOW);
    f.trash(TRASH + ".NoDate", "rejected", null);
    f.trash(TRASH + ".Pending", "pending", NOW - WEEK - 1);
    f.trash("TestPage.PAGE.doc-test.PROPOSITIONS.Outside", "rejected", NOW - WEEK - 1);
    f.trash(TRASH + ".Nested.Forbidden", "rejected", NOW - WEEK - 1);
    f.trash(TRASH + ".WebHome", "rejected", NOW - WEEK - 1);
    f.purge();
    check(f.wiki.deleted.equals(List.of(TRASH + ".Older", TRASH + ".AtBoundary")), "Only rejected flat trash pages expired at seven days may be purged: " + f.wiki.deleted);
    check(((Number)f.context.get("purgedCount")).intValue() == 2, "Incorrect actual purge count");
    done("Real COMMANDE purge deletes at the seven-day boundary and protects recent, pending, malformed and outside pages");

    f = new Fixture(); f.wiki.admin = true; f.configured(); f.group("reviewGroups", "XWiki.Reviewers");
    f.trash(TRASH + ".Expired", "rejected", NOW - WEEK);
    f.trash(TRASH + ".Fresh", "rejected", NOW - WEEK + 1);
    f.trash(TRASH + ".InvalidStatus", "pending", NOW);
    String listed = f.list("corbeille");
    check(!listed.contains("data-ref=\"" + TRASH + ".Expired\""), "Expired trash must disappear before physical purge");
    check(listed.contains("data-ref=\"" + TRASH + ".Fresh\""), "Trash still younger than seven days must remain visible");
    check(!listed.contains("data-ref=\"" + TRASH + ".InvalidStatus\""), "Only refused proposals belong in trash");
    check(f.wiki.deleted.isEmpty() && f.wiki.docs.size() == 3, "GET listing cannot delete wiki pages");
    done("Real GET Corbeille hides expired items at exactly seven days without mutating pages");

    f = new Fixture(); f.configured(); f.group("proposeGroups", "XWiki.Contributors");
    String mine = "TestPage.PAGE.doc-test.PROPOSITIONS.Mine", theirs = "TestPage.PAGE.doc-test.PROPOSITIONS.Other";
    f.trash(mine, "pending", null); f.trash(theirs, "pending", null);
    ((TrashDoc)f.wiki.docs.get(theirs)).proposal.set("author", "XWiki.Bob");
    listed = f.list("propositions");
    check(listed.contains("data-ref=\"" + mine + "\""), "Authors must see their pending proposals");
    check(!listed.contains("data-ref=\"" + theirs + "\""), "Ordinary proposers must not receive other authors' private proposal data");
    f.wiki.admin = true; f.group("reviewGroups", "XWiki.Reviewers"); listed = f.list("propositions");
    check(listed.contains("data-ref=\"" + theirs + "\""), "Validators must see pending proposals from other authors");
    done("Real proposal listing scopes private data to its author or a validator");

    for (String field : new Schema().properties.keySet()) {
      f = operationFixture("proposeGroups"); f.wiki.proposalSchema.properties.remove(field);
      Map<String, Integer> before = revisions(f);
      String invalidClass = f.post("ajouter un fichier", "type", "folder", "page", MAIN, "nom_fichier", "À examiner");
      String expectedType = List.of("submittedAt", "reviewedAt", "deletedAt").contains(field) ? "Date" : List.of("content", "description", "tags", "reviewComment").contains(field) ? "TextArea" : "String";
      check(invalidClass.equals("ERREUR_CLASSE_PROPOSITION") && f.pageOutput.contains("champ « " + field + " » absent (type " + expectedType + " attendu)"), "Missing field must identify its name and expected type: " + field + ": " + f.pageOutput);
      check(revisions(f).equals(before), "Missing proposal definitions cannot save a partial proposal or modify published documents");
      done("Missing proposal field " + field + " reports its expected type before saving");
    }
    for (String field : List.of("submittedAt", "reviewedAt", "deletedAt", "operation", "content")) {
      f = operationFixture("proposeGroups"); f.wiki.proposalSchema.properties.put(field, new Definition(field.equals("operation") ? "TextArea" : "String"));
      String invalidClass = f.post("ajouter un fichier", "type", "folder", "page", MAIN, "nom_fichier", "À examiner");
      check(invalidClass.equals("ERREUR_CLASSE_PROPOSITION") && f.pageOutput.contains("champ « " + field + " » de type incorrect"), "Wrong proposal definition must be refused before an incompatible value is set: " + field);
      check(f.wiki.docs.keySet().equals(Set.of(MAIN, GUIDE, TARGET)), "Wrong types cannot persist a partial proposal");
      done("Incorrect proposal field type " + field + " returns a precise configuration error");
    }
    f = operationFixture("proposeGroups"); f.wiki.proposalSchema.properties.get("reviewer").disabled = true;
    String invalidClass = f.post("ajouter un fichier", "type", "folder", "page", MAIN, "nom_fichier", "À examiner");
    check(invalidClass.equals("ERREUR_CLASSE_PROPOSITION") && f.pageOutput.contains("champ « reviewer » désactivé (type String attendu)"), "Disabled proposal fields must be identified before writing");
    done("Disabled proposal fields are detected through the script-safe XClass API");

    f = operationFixture("proposeGroups"); f.dates.now = new java.sql.Timestamp(NOW + 123);
    String typedDateResult = f.post("ajouter un document", "type", "document", "page", MAIN, "nom_fichier", "false", "content", "", "description", "false", "tags", "");
    check(typedDateResult.equals("PROPOSITION_OK"), "A real-like Timestamp normalization and valid empty/string fields must not trigger a class error: " + f.pageOutput);
    Obj datedProposal = f.wiki.docs.get(String.valueOf(f.context.get("resultProposalRef"))).getObject(PROPOSAL_CLASS);
    check(datedProposal.getValue("submittedAt").getClass() == Date.class && ((Date)datedProposal.getValue("submittedAt")).getTime() == NOW + 123, "The stored proposal date must preserve all milliseconds");
    check(!f.dates.now.toString().equals(datedProposal.getValue("submittedAt").toString()), "The regression fixture must reproduce the old invalid string comparison");
    for (String empty : List.of("reviewer", "reviewComment", "baseVersion", "sourceRef", "parentProposalRef", "publishedRef", "filename")) check(datedProposal.getProperty(empty) != null && datedProposal.getValue(empty).equals(""), "An existing empty field is valid: " + empty);
    done("Typed proposal dates, text equal to false, and valid empty fields create a pending proposal without false class errors");

    f = new Fixture(); f.configured(); f.group("proposeGroups", "XWiki.Contributors"); f.document(MAIN, "root", "Documentation");
    String result = f.post("ajouter un fichier", "mode", "proposal", "type", "folder", "page", MAIN, "nom_fichier", "Nouveau dossier", "batch_id", "batch-one");
    check(result.equals("PROPOSITION_OK"), "Creation proposal failed: " + result);
    String parentProposal = String.valueOf(f.context.get("resultProposalRef"));
    Doc parentPage = f.wiki.docs.get(parentProposal);
    check(parentProposal.startsWith(PROPOSALS + ".") && parentPage != null, "Proposal must be saved inside PROPOSITIONS");
    check(parentPage.getObject(PROPOSAL_CLASS).getValue("status").equals("pending"), "New proposal must be pending");
    check(f.wiki.docs.size() == 2, "A proposal cannot create the published folder immediately");
    check(parentPage.getObjects("XWiki.XWikiRights").size() == 2, "Proposal view and write ACL must be saved with it");
    done("Real POST creates a private proposal page in PROPOSITIONS without publishing the folder");

    result = f.post("ajouter un document", "mode", "proposal", "type", "document", "page", MAIN,
      "parent_proposal_ref", parentProposal, "nom_fichier", "Document enfant", "content", "**Texte**", "batch_id", "batch-one");
    check(result.equals("PROPOSITION_OK"), "Child proposal failed: " + result);
    String childProposal = String.valueOf(f.context.get("resultProposalRef"));
    f.wiki.admin = true; f.group("reviewGroups", "XWiki.Reviewers");
    result = f.post("valider proposition", "proposal_ref", childProposal, "version", f.wiki.docs.get(childProposal).getVersion());
    check(result.equals("ERREUR_DEPENDANCE_PROPOSITION"), "Child cannot publish before its proposed folder: " + result);
    check(f.wiki.docs.get(childProposal).getObject(PROPOSAL_CLASS).getValue("status").equals("pending"), "A failed validation must preserve the pending child");
    done("Real validation preserves a child proposal until its proposed parent has been validated");

    result = f.post("valider proposition", "proposal_ref", parentProposal, "version", parentPage.getVersion());
    check(result.equals("PROPOSITION_VALIDEE_OK"), "Parent validation failed: " + result);
    String publishedParent = String.valueOf(parentPage.getObject(PROPOSAL_CLASS).getValue("publishedRef"));
    check(f.wiki.docs.get(publishedParent).getObject(DOCUMENT_CLASS).getValue("type").equals("folder"), "Published parent must be a folder");
    check(f.wiki.docs.get(childProposal).getObject(PROPOSAL_CLASS).getValue("status").equals("pending"), "Validating a folder must not accept its children automatically");
    listed = f.list("propositions");
    java.util.regex.Matcher pendingChild = java.util.regex.Pattern.compile("<span class=\"doc-proposal-data\"[^>]*data-ref=\"" +
      java.util.regex.Pattern.quote(childProposal) + "\"[^>]*>").matcher(listed);
    check(pendingChild.find(), "Accepted parent must not hide its still-pending child");
    check(pendingChild.group().contains("data-parent-ref=\"" + publishedParent + "\""), "A pending child must appear under its parent's published destination in the existing tree");
    check(pendingChild.group().contains("data-parent-proposal-ref=\"\""), "An accepted proposed parent cannot remain a missing pending-tree dependency");
    check(f.wiki.docs.get(childProposal).getObject(PROPOSAL_CLASS).getValue("parentProposalRef").equals(parentProposal), "GET tree projection must not rewrite the stored proposal");
    result = f.post("valider proposition", "proposal_ref", childProposal, "version", f.wiki.docs.get(childProposal).getVersion());
    check(result.equals("PROPOSITION_VALIDEE_OK"), "Child validation after parent failed: " + result);
    Doc publishedChild = f.wiki.docs.get(String.valueOf(f.context.get("resultRef")));
    check(publishedChild.parent.equals(publishedParent), "The validated child must use its published parent destination");
    check(publishedChild.getObject("TestPage.PAGE.doc-test.CODE.docContentClass.WebHome").getValue("source").equals("**Texte**"), "Proposed document source was not retained");
    done("Real partial validation publishes each item independently under the accepted destination");

    f.wiki.admin = false; f.wiki.config.configuration.set("reviewGroups", "");
    result = f.post("ajouter un document", "mode", "proposal", "type", "document", "page", MAIN, "nom_fichier", "À revoir", "content", "Brouillon");
    check(result.equals("PROPOSITION_OK"), "Review fixture creation failed: " + result);
    String refusedRef = String.valueOf(f.context.get("resultProposalRef"));
    String version = f.wiki.docs.get(refusedRef).getVersion();
    result = f.post("refuser proposition", "proposal_ref", refusedRef, "version", version, "comment", "Incomplet");
    check(result.equals("ERREUR_DROITS"), "A proposer cannot refuse a proposal without validation right");
    f.wiki.admin = true; f.group("reviewGroups", "XWiki.Reviewers");
    result = f.post("refuser proposition", "proposal_ref", refusedRef, "version", "stale", "comment", "Incomplet");
    check(result.equals("ERREUR_CONFLIT_VERSION"), "A stale review must not move a proposal");
    result = f.post("refuser proposition", "proposal_ref", refusedRef, "version", version, "comment", "Incomplet");
    check(result.equals("PROPOSITION_REFUSEE_OK"), "Refusal failed: " + result);
    String trashRef = String.valueOf(f.context.get("resultRef"));
    check(trashRef.startsWith(TRASH + ".") && !f.wiki.docs.containsKey(refusedRef), "Refused page must move from PROPOSITIONS to CORBEILLE");
    Obj refused = f.wiki.docs.get(trashRef).getObject(PROPOSAL_CLASS);
    check(refused.getValue("status").equals("rejected") && refused.getValue("reviewComment").equals("Incomplet"), "Refusal status and reason must be stored");
    check(((Date)refused.getValue("deletedAt")).getTime() == NOW, "Trash retention must begin when refusal is saved");
    f.wiki.admin = false; f.wiki.config.configuration.set("reviewGroups", "");
    result = f.post("restaurer proposition", "proposal_ref", trashRef, "version", f.wiki.docs.get(trashRef).getVersion());
    check(result.equals("PROPOSITION_RESTAUREE_OK"), "Author restoration failed: " + result);
    check(f.wiki.docs.containsKey(refusedRef) && !f.wiki.docs.containsKey(trashRef), "Restoration must move the page back to PROPOSITIONS");
    check(f.wiki.docs.get(refusedRef).getObject(PROPOSAL_CLASS).getValue("status").equals("pending"), "Restored proposal must be pending again");
    done("Real refusal and author restoration move the proposal between the existing spaces and retain the reason and date");

    result = f.post("ajouter un fichier", "mode", "direct", "type", "folder", "page", MAIN, "nom_fichier", "Interdit");
    check(result.equals("ERREUR_DROITS"), "Browser-supplied direct mode cannot bypass server group rights");
    result = f.post("purger corbeille", "form_token", "invalid");
    check(result.equals("ERREUR_CSRF"), "Mutation must validate the CSRF token");
    done("Real mutation dispatcher enforces direct permissions and CSRF before writing");

    List<OperationCase> operations = List.of(
      new OperationCase("folder creation", "createGroups", "ajouter un fichier", "LIEN_AJOUTE_OK",
        new String[]{"type", "folder", "page", MAIN, "nom_fichier", "Nouveau dossier"}),
      new OperationCase("document creation", "createGroups", "ajouter un document", "LIEN_AJOUTE_OK",
        new String[]{"type", "document", "page", MAIN, "nom_fichier", "Nouveau document", "content", "Contenu créé"}),
      new OperationCase("file import", "importGroups", "ajouter un document", "LIEN_AJOUTE_OK",
        new String[]{"type", "document", "page", MAIN, "nom_fichier", "Fichier", "intent", "import", "source_kind", "file", "source_filename", "guide.txt"}),
      new OperationCase("metadata update", "modifyGroups", "modifier metadonnees document", "METADONNEES_OK",
        new String[]{"source_ref", GUIDE, "description", "Description modifiée", "tags", "Nouveau"}),
      new OperationCase("content update", "contentGroups", "modifier contenu document", "CONTENU_OK",
        new String[]{"source_ref", GUIDE, "content", "Texte modifié"}),
      new OperationCase("document move", "moveGroups", "deplacer element", "DEPLACEMENT_OK",
        new String[]{"source_ref", GUIDE, "target_parent_ref", TARGET})
    );
    for (boolean administrator : List.of(false, true)) {
      for (String state : List.of("missing page", "missing object", "empty lists", "empty version", "unknown version", "inaccessible")) {
        f = operationFixture("proposeGroups");
        result = f.post("ajouter un document", "type", "document", "page", MAIN, "nom_fichier", "En attente", "content", "Brouillon privé");
        check(result.equals("PROPOSITION_OK"), "The denial fixture must contain a real pending proposal");
        String pending = String.valueOf(f.context.get("resultProposalRef"));
        f.wiki.config.configuration.set("proposeGroups", "");
        f.wiki.admin = administrator;
        invalidOrEmptyConfiguration(f, state);
        Map<String, Integer> before = revisions(f);
        for (OperationCase operation : operations) {
          result = f.post(operation.action, operation.parameters);
          check(result.equals("ERREUR_DROITS"), (administrator ? "Administrator" : "Native editor") + " cannot execute " + operation.label + " with " + state + ": " + result);
          check(revisions(f).equals(before) && f.wiki.upload.loads == 0 && f.refactoring.moveCalls == 0, "Refused POST cannot change documents, process an upload or start a move job");
          check(!f.pageOutput.contains("id=\"creation-result\""), "A refused POST cannot expose a successful result");
        }
        result = f.post("supprimer element", "source_ref", GUIDE);
        check(result.equals("ERREUR_DROITS") && f.refactoring.deleteCalls == 0, "Native admin/edit/delete rights cannot authorize deletion without a configured delete group");
        for (String action : List.of("valider proposition", "refuser proposition")) {
          result = f.post(action, "proposal_ref", pending, "version", f.wiki.docs.get(pending).getVersion(), "comment", "Motif de refus");
          check(result.equals("ERREUR_DROITS"), "Validation and refusal require an explicit review group, including for administrators: " + result);
        }
        check(revisions(f).equals(before) && f.wiki.deleted.isEmpty(), "All refused mutations must preserve published documents and the pending proposal");
        check(f.wiki.docs.get(pending).getObject(PROPOSAL_CLASS).getValue("status").equals("pending"), "Refused review cannot change proposal status");
        denyWrites(f);
        done((administrator ? "Administrator" : "Native editor") + " POST creation/import/metadata/content/move/delete/review is denied without mutation with " + state);
      }
    }

    f = operationFixture(); f.wiki.admin = true; f.wiki.config.configurationObjectPresent = false;
    String managerGroup = "XWiki.IVQ_Gestionnaires";
    Doc managerGroupDocument = new Doc(f.wiki, managerGroup);
    managerGroupDocument.newObject("XWiki.XWikiGroups"); managerGroupDocument.saveAsAuthor("Existing administrator group", true);
    f.users.group.members.add(f.model.resolveDocument(managerGroup));
    f.render(); denyWrites(f);
    check(f.can("Configure") && f.pageOutput.contains("id=\"doc-settings\""), "An unconfigured administrator must still be able to open settings");
    result = f.post("enregistrer parametres", "expectedVersion", "1.1",
      "create_groups", managerGroup, "move_groups", managerGroup, "modify_groups", managerGroup, "import_groups", managerGroup,
      "content_groups", managerGroup, "propose_groups", managerGroup, "review_groups", managerGroup, "delete_groups", managerGroup);
    check(result.equals("PARAMETRES_OK"), "An administrator without action rights must be able to assign its existing group in settings: " + result);
    f.list("workflow");
    for (String right : List.of("Configure", "Create", "Move", "Modify", "Import", "Content", "Propose", "Review", "Delete"))
      check(f.can(right), "An explicit saved administrator group grant must take effect on the next request: " + right);
    result = f.post("ajouter un fichier", "type", "folder", "page", MAIN, "nom_fichier", "Dossier autorisé");
    check(result.equals("LIEN_AJOUTE_OK"), "The configured administrator must create directly after an explicit group grant");
    result = f.post("supprimer element", "source_ref", GUIDE);
    check(result.equals("SUPPRESSION_OK") && f.refactoring.deleteCalls == 1, "The configured administrator must delete only after its explicit group grant");
    result = f.post("enregistrer parametres", "expectedVersion", f.wiki.config.getVersion());
    check(result.equals("PARAMETRES_OK"), "The administrator must be able to revoke all action grants while keeping settings access");
    f.list("workflow"); denyWrites(f);
    check(f.can("Configure"), "Revoking all action grants must not lock an administrator out of settings");
    result = f.post("ajouter un fichier", "type", "folder", "page", MAIN, "nom_fichier", "Dossier désormais interdit");
    check(result.equals("ERREUR_DROITS"), "A subsequent administrator POST must honor revoked grants immediately");
    done("An administrator can save and revoke explicit IVQ_Gestionnaires grants through the real settings POST without implicit action rights");

    for (OperationCase operation : operations) {
      if (operation.grant.equals("importGroups")) continue; // Imports require the dedicated Importer/Create/Propose matrix below.
      for (String mode : List.of("", "direct", "proposal")) {
        f = operationFixture(operation.grant);
        result = f.post(operation.action, withMode(operation, mode));
        check(result.equals(operation.expected), operation.label + " must be direct with its own grant and no proposal grant, even with legacy mode=" + mode + ": " + result);
        check(!f.can("Propose") && String.valueOf(f.context.get("resultProposalRef")).isEmpty(), "Direct rights must not require or create proposals");
        check(f.wiki.docs.keySet().stream().noneMatch(reference -> reference.startsWith(PROPOSALS + ".")), "Direct execution cannot save a proposal page");
        check(f.pageOutput.contains("id=\"creation-result\" data-code=\"" + operation.expected + "\""), "Success must expose an explicit structured result code");
        if (operation.grant.equals("importGroups")) {
          Doc imported = f.wiki.docs.get(String.valueOf(f.context.get("resultRef")));
          check(imported.attachments.containsKey("guide.txt") && f.wiki.upload.loads == 1, "An import-only group must directly save its uploaded file without create rights");
        }
      }
      f = operationFixture(operation.grant, "proposeGroups");
      result = f.post(operation.action, withMode(operation, "proposal"));
      check(result.equals(operation.expected), "Having both rights must still execute " + operation.label + " directly");
      done("Automatic direct " + operation.label + " needs only its own group and ignores a legacy proposal mode");

      f = operationFixture("proposeGroups"); Map<String, Integer> before = revisions(f);
      result = f.post(operation.action, operation.parameters);
      check(result.equals("PROPOSITION_OK"), "A proposer without " + operation.grant + " must stage " + operation.label + ": " + result);
      check(f.wiki.docs.size() == before.size() + 1 && f.wiki.docs.containsKey(GUIDE), "Proposing cannot publish, move, or delete an existing source");
      for (String reference : before.keySet()) check(f.wiki.docs.get(reference).revision == before.get(reference), "Proposing cannot save a published page: " + reference);
      check(f.wiki.docs.get(GUIDE).content.equals("Contenu original"), "Proposing must preserve published source content");
      Doc proposal = f.wiki.docs.get(String.valueOf(f.context.get("resultProposalRef")));
      check(proposal.getObject(PROPOSAL_CLASS).getValue("status").equals("pending"), "Automatic proposal must await a validator");
      if (operation.grant.equals("importGroups")) check(proposal.attachments.containsKey("guide.txt"), "An imported proposal must keep its uploaded file private until validation");
      done("Proposer-only " + operation.label + " automatically creates a pending private proposal");

      f = operationFixture(); before = revisions(f);
      result = f.post(operation.action, operation.parameters);
      check(result.equals("ERREUR_DROITS"), "No direct or proposal grant must refuse " + operation.label + ": " + result);
      check(revisions(f).equals(before) && f.wiki.upload.loads == 0 && f.refactoring.moveCalls == 0, "Refusal must happen before published mutations, upload processing, or refactoring");
      check(f.pageOutput.contains("id=\"documentation-error\"") && f.pageOutput.contains("data-message=\"Vous n’avez pas le droit") && !f.pageOutput.contains("id=\"creation-result\""), "Permission refusal must expose a short structured error without a success marker");
      done("Missing direct and proposal rights refuse " + operation.label + " before any published change");
    }

    f = operationFixture("createGroups", "proposeGroups");
    OperationCase importOperation = operations.get(2);
    result = f.post(importOperation.action, importOperation.parameters);
    check(result.equals("ERREUR_DROITS") && !f.can("Import") && f.can("Create") && f.wiki.upload.loads == 0, "Create and propose permissions must not bypass the import permission");
    result = f.post("ajouter un fichier", "type", "folder", "page", MAIN, "nom_fichier", "Mode invalide", "mode", "unexpected");
    check(result.equals("ERREUR_MODE"), "Unknown legacy modes must still be rejected");
    done("Mixed creator and proposer rights cannot import without Importer, and invalid modes fail closed");

    for (int rights = 0; rights < 8; rights++) {
      boolean importer = (rights & 1) != 0, creator = (rights & 2) != 0, proposer = (rights & 4) != 0;
      List<String> grants = new ArrayList<>();
      if (importer) grants.add("importGroups"); if (creator) grants.add("createGroups"); if (proposer) grants.add("proposeGroups");
      for (String mode : List.of("", "direct", "proposal")) {
        for (String trigger : List.of("intent", "source_kind", "filename_only", "folder")) {
          f = operationFixture(grants.toArray(String[]::new)); Map<String, Integer> before = revisions(f);
          List<String> parameters = new ArrayList<>(List.of("type", trigger.equals("folder") ? "folder" : "document", "page", MAIN, "nom_fichier", "Lot importé", "batch_id", "batch-import"));
          if (!mode.isEmpty()) { parameters.add("mode"); parameters.add(mode); }
          if (trigger.equals("intent") || trigger.equals("folder")) { parameters.add("intent"); parameters.add("import"); }
          if (trigger.equals("source_kind")) { parameters.add("source_kind"); parameters.add("file"); }
          if (!trigger.equals("folder")) { parameters.add("source_filename"); parameters.add("guide.txt"); }
          result = f.post(trigger.equals("folder") ? "ajouter un fichier" : "ajouter un document", parameters.toArray(String[]::new));
          boolean direct = importer && creator, pending = importer && !creator && !mode.equals("direct");
          String expected = direct ? "LIEN_AJOUTE_OK" : pending ? "PROPOSITION_OK" : "ERREUR_DROITS";
          check(result.equals(expected), "Import policy mismatch for rights=" + grants + ", mode=" + mode + ", trigger=" + trigger + ": " + result);
          if (pending) {
            Doc staged = f.wiki.docs.get(String.valueOf(f.context.get("resultProposalRef")));
            check(staged != null && staged.getObject(PROPOSAL_CLASS).getValue("status").equals("pending") && staged.getObject(PROPOSAL_CLASS).getValue("operation").equals("import"), "Imported files and folders without Create must be pending import proposals");
            if (!trigger.equals("folder")) check(staged.attachments.containsKey("guide.txt"), "Imported files must remain in the private proposal");
            for (String ref : before.keySet()) check(f.wiki.docs.get(ref).revision == before.get(ref), "Import proposals cannot change a published page");
          } else if (direct) {
            check(f.wiki.docs.keySet().stream().noneMatch(ref -> ref.startsWith(PROPOSALS + ".")), "Importer + Create publishes without requiring Propose");
          } else check(revisions(f).equals(before) && f.wiki.upload.loads == 0, "Refused imports cannot load files or save wiki pages");
        }
      }
      done("Import permissions Importer=" + importer + ", Create=" + creator + ", Propose=" + proposer + " apply to files, folders and forged legacy requests");
    }

    f = operationFixture("importGroups");
    result = f.post(importOperation.action, importOperation.parameters);
    check(result.equals("PROPOSITION_OK"), "Importer alone must stage an imported file");
    String importToValidate = String.valueOf(f.context.get("resultProposalRef"));
    check(f.list("propositions").contains("data-ref=\"" + importToValidate + "\""), "Importer-only authors must see their pending imported proposals");
    f.group("reviewGroups", "XWiki.Validators");
    result = f.post("refuser proposition", "proposal_ref", importToValidate, "version", f.wiki.docs.get(importToValidate).getVersion(), "comment", "À compléter");
    check(result.equals("PROPOSITION_REFUSEE_OK"), "A validator must be able to reject an importer-only proposal: " + result);
    String importInTrash = String.valueOf(f.context.get("resultRef"));
    f.wiki.config.configuration.set("reviewGroups", "");
    check(f.list("corbeille").contains("data-ref=\"" + importInTrash + "\"") && f.pageOutput.contains("data-can-restore=\"true\""), "Importer-only authors must see their rejected imported proposals and their per-proposal restore grant");
    f.user.user = new Ref("xwiki", "XWiki.Bob");
    check(!f.list("corbeille").contains("data-ref=\"" + importInTrash + "\""), "Another importer cannot read someone else's private proposal");
    result = f.post("restaurer proposition", "proposal_ref", importInTrash, "version", f.wiki.docs.get(importInTrash).getVersion());
    check(result.equals("ERREUR_DROITS") && f.wiki.docs.containsKey(importInTrash), "Another importer cannot restore someone else's rejected import");
    f.user.user = new Ref("xwiki", "XWiki.Alice");
    result = f.post("restaurer proposition", "proposal_ref", importInTrash, "version", f.wiki.docs.get(importInTrash).getVersion());
    check(result.equals("PROPOSITION_RESTAUREE_OK"), "Importer-only authors can restore their own rejected import without Propose: " + result);
    importToValidate = String.valueOf(f.context.get("resultRef"));
    check(f.wiki.docs.get(importToValidate).getObject(PROPOSAL_CLASS).getValue("status").equals("pending"), "Restoring an imported proposal returns it to pending without publishing");
    check(f.wiki.docs.keySet().equals(Set.of(MAIN, GUIDE, TARGET, importToValidate)), "No imported page may be published before validation");
    done("Importer-only authors can list, receive a rejection and restore their imported proposal without publishing");
    f.wiki.config.configuration.set("importGroups", ""); f.wiki.config.configuration.set("proposeGroups", ""); f.group("reviewGroups", "XWiki.Validators");
    result = f.post("valider proposition", "proposal_ref", importToValidate, "version", f.wiki.docs.get(importToValidate).getVersion());
    check(result.equals("PROPOSITION_VALIDEE_OK") && !f.can("Import") && !f.can("Create") && !f.can("Propose"), "A validator can accept an imported proposal without Importer, Create or Propose: " + result);
    Doc validatedImport = f.wiki.docs.get(String.valueOf(f.context.get("resultRef")));
    check(validatedImport != null && validatedImport.attachments.containsKey("guide.txt"), "Validating an imported proposal must publish its uploaded attachment");
    done("A validator-only account can accept a staged import and publish its attachment");

    f = operationFixture("proposeGroups");
    result = f.post("ajouter un document", "type", "document", "page", MAIN, "nom_fichier", "Document à corriger", "content", "Texte proposé");
    check(result.equals("PROPOSITION_OK"), "A regular creation proposal must be available for the restore-permission regression");
    String nonImportProposal = String.valueOf(f.context.get("resultProposalRef"));
    f.group("reviewGroups", "XWiki.Validators");
    result = f.post("refuser proposition", "proposal_ref", nonImportProposal, "version", f.wiki.docs.get(nonImportProposal).getVersion(), "comment", "À corriger");
    check(result.equals("PROPOSITION_REFUSEE_OK"), "The normal proposal must reach trash before testing revoked Propose");
    String nonImportTrash = String.valueOf(f.context.get("resultRef"));
    f.wiki.config.configuration.set("reviewGroups", ""); f.wiki.config.configuration.set("proposeGroups", ""); f.group("importGroups", "XWiki.Importers");
    check(f.list("corbeille").contains("data-ref=\"" + nonImportTrash + "\"") && f.pageOutput.contains("data-can-restore=\"false\""), "Importer-only rights cannot advertise restore permission for an older non-import proposal");
    result = f.post("restaurer proposition", "proposal_ref", nonImportTrash, "version", f.wiki.docs.get(nonImportTrash).getVersion());
    check(result.equals("ERREUR_DROITS") && f.wiki.docs.containsKey(nonImportTrash), "Importer-only rights cannot restore a non-import proposal after Propose has been revoked");
    done("Importer-only restore rights apply solely to the author's imports, never another author or a different operation");

    for (String type : List.of("document", "attached-document", "folder")) {
      for (String[] grants : List.of(new String[]{}, new String[]{"proposeGroups"}, new String[]{"createGroups", "reviewGroups"})) {
        f = operationFixture(grants); Doc protectedSource = f.wiki.docs.get(GUIDE);
        protectedSource.getObject(DOCUMENT_CLASS).set("type", type.equals("folder") ? "folder" : "document");
        if (type.equals("attached-document")) protectedSource.addAttachment("guide.txt", new byte[]{1, 2, 3});
        if (type.equals("folder")) {
          Doc descendant = f.document("TestPage.PAGE.doc-test.Guide.Enfant.WebHome", "document", "Enfant"); descendant.parent = GUIDE;
        }
        Map<String, Integer> before = revisions(f);
        for (String mode : List.of("", "direct", "proposal")) {
          result = f.post("supprimer element", "source_ref", GUIDE, "mode", mode);
          check(result.equals("ERREUR_DROITS"), "Deletion requires its own application grant for " + type + ": " + result);
          check(revisions(f).equals(before) && f.wiki.deleted.isEmpty() && f.refactoring.deleteCalls == 0, "Forbidden deletion cannot touch a source, attachment or descendant, nor start a native delete job");
          check(f.pageOutput.contains("data-message=\"Vous n’avez pas le droit de supprimer cet élément.\"") && !f.pageOutput.contains("SUPPRESSION_OK") && !f.pageOutput.contains("id=\"creation-result\""), "Forbidden deletion must expose its own concise error and never a success marker");
        }
      }
      done("Forbidden " + type + " deletion is blocked for readers, proposers and other writers, regardless of legacy mode");
    }

    f = operationFixture("deleteGroups"); f.wiki.nativeDelete = false;
    result = f.post("supprimer element", "source_ref", GUIDE);
    check(result.equals("ERREUR_DROITS_NATIFS") && f.refactoring.deleteCalls == 0 && f.wiki.docs.containsKey(GUIDE), "The application delete grant cannot bypass XWiki native source permission");
    done("Deletion also requires native XWiki permission before a delete job starts");

    for (boolean nativeAdministrator : List.of(false, true)) {
      f = operationFixture("deleteGroups"); f.wiki.admin = nativeAdministrator;
      f.wiki.docs.get(GUIDE).getObject(DOCUMENT_CLASS).set("type", "folder");
      Doc descendant = f.document("TestPage.PAGE.doc-test.Guide.Enfant.WebHome", "document", "Enfant"); descendant.parent = GUIDE;
      result = f.post("supprimer element", "source_ref", GUIDE, "mode", "proposal", "delete_snapshot", f.deletionSnapshot(GUIDE));
      check(result.equals("SUPPRESSION_OK") && !f.wiki.docs.containsKey(GUIDE) && !f.wiki.docs.containsKey(descendant.reference), "Authorized deletion must directly remove the native folder and descendant even with a legacy proposal mode: " + result);
      check(f.refactoring.deleteCalls == 1 && !f.can("Propose"), "Delete-only group needs no proposal permission, including for administrators");
    }
    done("Explicit delete-only groups let members and administrators delete folders without proposal permission");

    f = operationFixture("deleteGroups"); f.refactoring.failDelete = true;
    result = f.post("supprimer element", "source_ref", GUIDE);
    check(result.equals("ERREUR_SUPPRESSION") && f.wiki.docs.containsKey(GUIDE) && !f.pageOutput.contains("SUPPRESSION_OK") && !f.pageOutput.contains("id=\"creation-result\""), "A failed native delete cannot report success");
    done("Native deletion failure preserves the source and returns an error rather than success");

    f = operationFixture("proposeGroups");
    result = f.post("ajouter un document", "type", "document", "page", MAIN, "nom_fichier", "À valider", "content", "Texte à valider");
    String reviewable = String.valueOf(f.context.get("resultProposalRef"));
    f.wiki.config.configuration.set("proposeGroups", ""); f.group("reviewGroups", "XWiki.Validators");
    result = f.post("valider proposition", "proposal_ref", reviewable, "version", f.wiki.docs.get(reviewable).getVersion());
    check(result.equals("PROPOSITION_VALIDEE_OK") && f.can("Review") && !f.can("Create") && !f.can("Propose"), "A validator may accept a proposal without direct create or propose permission: " + result);
    done("Validator-only groups can publish accepted proposals without create or propose grants");

    f = operationFixture("proposeGroups");
    f.post("ajouter un document", "type", "document", "page", MAIN, "nom_fichier", "Proposition altérée", "content", "Brouillon");
    String invalidDeletion = String.valueOf(f.context.get("resultProposalRef"));
    Doc invalidProposal = f.wiki.docs.get(invalidDeletion);
    invalidProposal.getObject(PROPOSAL_CLASS).set("operation", "delete");
    invalidProposal.getObject(PROPOSAL_CLASS).set("sourceRef", GUIDE);
    f.wiki.admin = true; f.group("reviewGroups", "XWiki.Reviewers");
    result = f.post("valider proposition", "proposal_ref", invalidDeletion, "version", invalidProposal.getVersion());
    check(result.equals("ERREUR_ACTION") && f.refactoring.deleteCalls == 0 && f.wiki.docs.containsKey(GUIDE), "Even administrators cannot validate a malformed deletion proposal");
    check(invalidProposal.getObject(PROPOSAL_CLASS).getValue("status").equals("pending"), "Invalid deletion validation cannot mark a proposal as accepted");
    done("The validator endpoint rejects a malformed deletion proposal before any published mutation");

    f = new Fixture(); f.configured(); f.group("proposeGroups", "XWiki.Contributors");
    String sourceRef = "TestPage.PAGE.doc-test.Guide.WebHome";
    Doc source = f.document(sourceRef, "document", "Guide"); source.content = "Texte original";
    source.getObject(DOCUMENT_CLASS).set("description", "Description originale");
    result = f.post("modifier metadonnees document", "mode", "proposal", "source_ref", sourceRef,
      "base_version", source.getVersion(), "description", "Description proposée", "tags", "Nouveau tag");
    check(result.equals("PROPOSITION_OK"), "Metadata proposal failed: " + result);
    String metadataProposal = String.valueOf(f.context.get("resultProposalRef"));
    check(source.content.equals("Texte original") && source.getObject(DOCUMENT_CLASS).getValue("description").equals("Description originale"), "Proposing metadata must preserve published content and metadata");
    f.wiki.admin = true; f.group("reviewGroups", "XWiki.Reviewers");
    result = f.post("valider proposition", "proposal_ref", metadataProposal, "version", f.wiki.docs.get(metadataProposal).getVersion());
    check(result.equals("PROPOSITION_VALIDEE_OK"), "Metadata validation failed: " + result);
    check(source.getObject(DOCUMENT_CLASS).getValue("description").equals("Description proposée"), "Accepted metadata must update the existing document");
    check(source.getObject("TestPage.PAGE.doc-test.CODE.docContentClass.WebHome").getValue("source").equals("Texte original"), "Wrapping the original document must preserve its text");
    done("Real metadata proposal leaves the document unchanged until validation and retains its existing content");

    f.wiki.admin = false; f.wiki.config.configuration.set("reviewGroups", "");
    result = f.post("modifier contenu document", "mode", "proposal", "source_ref", sourceRef,
      "base_version", source.getVersion(), "content", "Texte {{/velocity}} proposé ERREUR_CSRF");
    check(result.equals("PROPOSITION_OK"), "Content proposal failed: " + result);
    String contentProposal = String.valueOf(f.context.get("resultProposalRef"));
    check(source.getObject("TestPage.PAGE.doc-test.CODE.docContentClass.WebHome").getValue("source").equals("Texte original"), "Content proposals cannot modify the published source");
    source.saveAsAuthor("Concurrent edit", true);
    f.wiki.admin = true; f.group("reviewGroups", "XWiki.Reviewers");
    result = f.post("valider proposition", "proposal_ref", contentProposal, "version", f.wiki.docs.get(contentProposal).getVersion());
    check(result.equals("ERREUR_CONFLIT_VERSION"), "Concurrent source editing must prevent applying an outdated content proposal: " + result);
    check(f.wiki.docs.get(contentProposal).getObject(PROPOSAL_CLASS).getValue("status").equals("pending"), "A conflict must keep the proposal available for review");
    check(source.getObject("TestPage.PAGE.doc-test.CODE.docContentClass.WebHome").getValue("source").equals("Texte original"), "A conflict cannot replace the published content");
    done("Real content proposal remains separate and a concurrent source revision blocks stale validation");

    f = new Fixture(); f.configured(); f.group("proposeGroups", "XWiki.Contributors");
    f.document(MAIN, "root", "Documentation"); f.wiki.serviceAdmin = false;
    result = f.post("ajouter un fichier", "mode", "proposal", "type", "folder", "page", MAIN, "nom_fichier", "Dossier privé");
    check(result.equals("ERREUR_DROITS_SERVICE"), "An unprivileged service author cannot sign private proposal ACLs: " + result);
    check(f.wiki.docs.size() == 1, "A proposal cannot be persisted when its service author cannot apply private rights");
    done("An unprivileged COMMANDE author cannot persist a proposal with unenforceable private rights");
    f = new Fixture(); f.render(); f.commandMacros();
    String movedFolder = "TestPage.PAGE.doc-test.Cible.Dossier.WebHome";
    String movedChild = "TestPage.PAGE.doc-test.Cible.Dossier.Guide.WebHome";
    Doc moved = f.document(movedFolder, "folder", "Dossier");
    Doc child = f.document(movedChild, "document", "Guide"); child.parent = movedFolder; child.content = "Contenu conservé";
    moved.getObject(DOCUMENT_CLASS).set("id", "ancienne référence");
    child.getObject(DOCUMENT_CLASS).set("id", "ancienne référence enfant");
    Doc foreign = f.document("Autre.Document.WebHome", "document", "Hors périmètre"); foreign.parent = movedFolder;
    foreign.getObject(DOCUMENT_CLASS).set("id", "à conserver");
    f.context.put("movedRootForTest", movedFolder);
    f.evaluateCommand("#updateMovedDocumentIds($movedRootForTest)");
    check(moved.getObject(DOCUMENT_CLASS).getValue("id").equals(movedFolder), "Moved folder id must match its native reference");
    check(child.getObject(DOCUMENT_CLASS).getValue("id").equals(movedChild), "Descendant id must match its native reference");
    check(child.content.equals("Contenu conservé") && foreign.getObject(DOCUMENT_CLASS).getValue("id").equals("à conserver"), "Updating identifiers must preserve content and ignore foreign pages");
    done("Native moves retain correct docClass identifiers for the folder and its descendants");
    f = operationFixture("proposeGroups");
    String editable = stage(f, "ajouter un document", "type", "document", "page", MAIN, "nom_fichier", "Avant", "content", "Contenu privé");
    Doc editableDoc = f.wiki.docs.get(editable); String staleEditVersion = editableDoc.getVersion();
    Map<String, Integer> publishedBeforeEdit = revisions(f);
    result = amend(f, editable, "Après", TARGET, "");
    check(result.equals("PROPOSITION_MODIFIEE_OK"), "The current author with Propose must be able to amend a pending document: " + result);
    Obj editableObject = editableDoc.getObject(PROPOSAL_CLASS);
    check(editableObject.getValue("title").equals("Après") && editableObject.getValue("parentRef").equals(TARGET) && editableObject.getValue("status").equals("pending"), "An amendment must store the new title and target without accepting");
    check(editableObject.getValue("author").equals("XWiki.Alice") && editableObject.getValue("content").equals("Contenu privé"), "Editing placement must preserve the original contributor and proposed source");
    for (String ref : publishedBeforeEdit.keySet()) if (!ref.equals(editable)) check(f.wiki.docs.get(ref).revision == publishedBeforeEdit.get(ref), "Amendments cannot change a published document");
    check(f.list("propositions").contains("data-can-edit=\"true\""), "Authors must receive the server-calculated amend permission");
    result = f.post("modifier proposition", "proposal_ref", editable, "version", staleEditVersion, "title", "Obsolète", "parent_ref", MAIN);
    check(result.equals("ERREUR_CONFLIT_VERSION") && editableObject.getValue("title").equals("Après"), "A stale amendment must not overwrite a newer title");
    done("Authors amend pending titles and placement without publishing, and stale versions are rejected");

    f.user.user = new Ref("xwiki", "XWiki.Bob");
    check(amend(f, editable, "Autre auteur", MAIN, "").equals("ERREUR_DROITS"), "A proposer cannot amend someone else's submission");
    check(!f.list("propositions").contains("data-ref=\"" + editable + "\""), "An unrelated author cannot list another person's private submission");
    f.user.user = new Ref("xwiki", "XWiki.Alice"); f.wiki.config.configuration.set("proposeGroups", ""); f.wiki.admin = true;
    check(amend(f, editable, "Droit révoqué", MAIN, "").equals("ERREUR_DROITS"), "Revoking Propose must also revoke amendment rights, including for native admins");
    f.user.user = new Ref("xwiki", "XWiki.Bob"); f.group("reviewGroups", "XWiki.Validators");
    check(amend(f, editable, "Titre validateur", TARGET, "").equals("PROPOSITION_MODIFIEE_OK"), "A validator-only account can amend any pending submission");
    result = f.post("valider proposition", "proposal_ref", editable, "version", editableDoc.getVersion());
    check(result.equals("PROPOSITION_VALIDEE_OK"), "An amended creation must still validate: " + result);
    Doc editedPublished = f.wiki.docs.get(String.valueOf(f.context.get("resultRef")));
    check(editedPublished.reference.startsWith("TestPage.PAGE.doc-test.Cible.") && editedPublished.getObject(DOCUMENT_CLASS).getValue("nom").equals("Titre validateur"), "Acceptance must use the corrected title and target");
    check(editedPublished.getObject(DOCUMENT_CLASS).getValue("createur").equals("XWiki.Alice"), "Acceptance must preserve the initial contributor");
    check(amend(f, editable, "Déjà accepté", MAIN, "").equals("ERREUR_ETAT_PROPOSITION"), "Accepted submissions cannot be amended");
    done("Amendment permissions distinguish authors, validators, revoked grants and accepted submissions");

    f = operationFixture("importGroups");
    String editableImport = stage(f, importOperation.action, importOperation.parameters);
    check(amend(f, editableImport, "Import corrigé", TARGET, "").equals("PROPOSITION_MODIFIEE_OK"), "Importer-only authors may amend their own import");
    check(f.wiki.docs.get(editableImport).attachments.containsKey("guide.txt"), "Amending an import preserves its private attachment");
    f.wiki.config.configuration.set("importGroups", ""); f.group("proposeGroups", "XWiki.Contributors");
    check(amend(f, editableImport, "Import renommé", TARGET, "").equals("PROPOSITION_MODIFIEE_OK"), "An author retaining Propose may amend their own earlier import");
    done("Importer-only authors can rename and relocate imports while keeping private attachments");

    f = operationFixture("proposeGroups");
    String proposedFolder = stage(f, "ajouter un fichier", "type", "folder", "page", MAIN, "nom_fichier", "Parent");
    String proposedChild = stage(f, "ajouter un fichier", "type", "folder", "page", TARGET, "parent_proposal_ref", proposedFolder, "nom_fichier", "Enfant");
    check(f.wiki.docs.get(proposedChild).getObject(PROPOSAL_CLASS).getValue("parentRef").equals(MAIN), "The server must derive the published anchor from the actual proposed parent");
    String proposedGrandchild = stage(f, "ajouter un document", "type", "document", "page", MAIN, "parent_proposal_ref", proposedChild, "nom_fichier", "Petit-enfant", "content", "Document");
    Map<String, Integer> beforeCycle = revisions(f);
    check(amend(f, proposedFolder, "Parent", MAIN, proposedFolder).equals("ERREUR_CYCLE_PROPOSITION"), "A proposed folder cannot become its own parent");
    check(amend(f, proposedFolder, "Parent", MAIN, proposedChild).equals("ERREUR_CYCLE_PROPOSITION"), "A proposed folder cannot become a child of a descendant");
    check(revisions(f).equals(beforeCycle), "Rejected cycles must not save any page");
    f.group("reviewGroups", "XWiki.Validators");
    String childVersionBeforeParent = f.wiki.docs.get(proposedChild).getVersion();
    check(f.post("valider proposition", "proposal_ref", proposedGrandchild, "version", f.wiki.docs.get(proposedGrandchild).getVersion()).equals("ERREUR_DEPENDANCE_PROPOSITION"), "Children require their proposed parent to be accepted first");
    check(amend(f, proposedFolder, "Parent corrigé", TARGET, "").equals("PROPOSITION_MODIFIEE_OK"), "A whole pending branch can be relocated by amending its root");
    for (String ref : List.of(proposedFolder, proposedChild, proposedGrandchild)) {
      check(f.post("valider proposition", "proposal_ref", ref, "version", f.wiki.docs.get(ref).getVersion()).equals("PROPOSITION_VALIDEE_OK"), "A branch must validate in parent-first order: " + ref);
      if (ref.equals(proposedFolder)) check(f.wiki.docs.get(proposedChild).getVersion().equals(childVersionBeforeParent), "Accepting a parent must not silently change children's versions");
    }
    Doc publishedGrandchild = f.wiki.docs.get(String.valueOf(f.context.get("resultRef")));
    check(publishedGrandchild.reference.startsWith("TestPage.PAGE.doc-test.Cible.") && publishedGrandchild.reference.split("\\.").length == 8, "The accepted descendant must remain in the relocated branch");
    done("Transitive cycles are blocked and relocated branches validate parent-first without rewriting children");

    f = operationFixture("proposeGroups");
    String movingProposal = stage(f, "deplacer element", "source_ref", GUIDE, "target_parent_ref", TARGET, "base_version", f.wiki.docs.get(GUIDE).getVersion());
    check(amend(f, movingProposal, "Guide renommé", TARGET, "").equals("PROPOSITION_MODIFIEE_OK"), "A pending move may also correct its display title");
    f.group("reviewGroups", "XWiki.Validators");
    check(f.post("valider proposition", "proposal_ref", movingProposal, "version", f.wiki.docs.get(movingProposal).getVersion()).equals("PROPOSITION_VALIDEE_OK"), "An amended move must validate");
    Doc movedAndRenamed = f.wiki.docs.get("TestPage.PAGE.doc-test.Cible.Guide.WebHome");
    check(movedAndRenamed != null && movedAndRenamed.getObject(DOCUMENT_CLASS).getValue("nom").equals("Guide renommé") && movedAndRenamed.title.equals("Guide renommé"), "Native movement must apply the corrected visible title and metadata");
    done("Accepting an amended move preserves native movement and applies the corrected visible title");

    f = operationFixture("proposeGroups");
    String renameOnly = stage(f, "deplacer element", "source_ref", GUIDE, "target_parent_ref", TARGET, "base_version", f.wiki.docs.get(GUIDE).getVersion());
    check(amend(f, renameOnly, "Guide même dossier", MAIN, "").equals("PROPOSITION_MODIFIEE_OK"), "An amended move may return to its original parent while retaining a rename");
    f.group("reviewGroups", "XWiki.Validators");
    check(f.post("valider proposition", "proposal_ref", renameOnly, "version", f.wiki.docs.get(renameOnly).getVersion()).equals("PROPOSITION_VALIDEE_OK") && f.refactoring.moveCalls == 0, "A rename-only amended move does not need a native relocation");
    check(f.wiki.docs.get(GUIDE).title.equals("Guide même dossier"), "Accepting a rename-only amendment must correct the source title");
    done("A pending move can become a rename in the original folder");

    f = operationFixture("proposeGroups"); f.wiki.docs.get(GUIDE).getObject(DOCUMENT_CLASS).set("type", "folder");
    Doc childNotMoved = f.document("TestPage.PAGE.doc-test.Guide.Enfant.WebHome", "document", "Enfant"); childNotMoved.parent = GUIDE;
    String partialMoveProposal = stage(f, "deplacer element", "source_ref", GUIDE, "target_parent_ref", TARGET, "base_version", f.wiki.docs.get(GUIDE).getVersion());
    f.group("reviewGroups", "XWiki.Validators"); f.refactoring.partialMove = true;
    result = f.post("valider proposition", "proposal_ref", partialMoveProposal, "version", f.wiki.docs.get(partialMoveProposal).getVersion());
    check(result.equals("ERREUR_DEPLACEMENT") && !f.wiki.docs.containsKey(GUIDE) && f.wiki.docs.containsKey(childNotMoved.reference), "A native job that moved the root but left a descendant must report an incomplete movement");
    check(f.wiki.docs.get(partialMoveProposal).getObject(PROPOSAL_CLASS).getValue("status").equals("pending") && !f.pageOutput.contains("PROPOSITION_VALIDEE_OK"), "A partially moved branch cannot be marked accepted");
    done("A native move logging a descendant failure cannot report a fully accepted proposal");

    for (String operation : List.of("modify", "content")) {
      f = operationFixture("proposeGroups");
      String changed = operation.equals("modify")
        ? stage(f, "modifier metadonnees document", "source_ref", GUIDE, "base_version", f.wiki.docs.get(GUIDE).getVersion(), "description", "Description validée", "tags", "tag")
        : stage(f, "modifier contenu document", "source_ref", GUIDE, "base_version", f.wiki.docs.get(GUIDE).getVersion(), "content", "Contenu validé");
      check(amend(f, changed, "Guide corrigé", TARGET, "").equals("PROPOSITION_MODIFIEE_OK"), "Pending " + operation + " may be renamed and moved");
      check(f.wiki.docs.containsKey(GUIDE) && f.wiki.docs.get(GUIDE).content.equals("Contenu original"), "Amending " + operation + " leaves the published source unchanged");
      f.group("reviewGroups", "XWiki.Validators");
      result = f.post("valider proposition", "proposal_ref", changed, "version", f.wiki.docs.get(changed).getVersion());
      check(result.equals("PROPOSITION_VALIDEE_OK"), "Relocated " + operation + " must validate after the native move: " + result);
      Doc acceptedChange = f.wiki.docs.get("TestPage.PAGE.doc-test.Cible.Guide.WebHome");
      check(!f.wiki.docs.containsKey(GUIDE) && acceptedChange.title.equals("Guide corrigé"), "Accepted " + operation + " must use the corrected location and title");
      check(acceptedChange.getObject(CONTENT_CLASS).getValue("source").equals(operation.equals("content") ? "Contenu validé" : "Contenu original"), "Accepted " + operation + " must retain the intended document source");
      if (operation.equals("modify")) check(acceptedChange.getObject(DOCUMENT_CLASS).getValue("description").equals("Description validée"), "Metadata must be applied after movement");
      done("A pending " + operation + " can be renamed, relocated and accepted with its intended data");
    }

    f = operationFixture("proposeGroups");
    String protectedEdit = stage(f, "ajouter un document", "type", "document", "page", MAIN, "nom_fichier", "Titre", "content", "Source");
    for (String invalidTitle : List.of("", "  ", "{{velocity}}", "a".repeat(256))) {
      check(!amend(f, protectedEdit, invalidTitle, MAIN, "").equals("PROPOSITION_MODIFIEE_OK"), "Invalid amendment titles must be rejected");
    }
    check(amend(f, protectedEdit, "Titre", "TestPage.PAGE.doc-test.CODE.WebHome", "").equals("ERREUR_DESTINATION_INVALIDE"), "Protected destinations cannot receive amended proposals");
    check(f.post("modifier proposition", "proposal_ref", protectedEdit, "version", f.wiki.docs.get(protectedEdit).getVersion(), "title", "Titre", "parent_ref", MAIN, "form_token", "wrong").equals("ERREUR_CSRF"), "Amendment requires a valid CSRF token");
    done("Proposal amendments reject invalid titles, protected targets and invalid CSRF tokens");

    f = operationFixture("deleteGroups"); f.wiki.docs.get(GUIDE).getObject(DOCUMENT_CLASS).set("type", "folder");
    String physicalChildRef = "TestPage.PAGE.doc-test.Guide.Enfant.WebHome";
    Doc physicalChild = f.document(physicalChildRef, "document", "Enfant physique"); physicalChild.parent = TARGET;
    String logicalOnlyRef = "TestPage.PAGE.doc-test.Cible.Logique.WebHome";
    Doc logicalOnly = f.document(logicalOnlyRef, "document", "Enfant logique"); logicalOnly.parent = GUIDE;
    String annexRef = "TestPage.PAGE.doc-test.Guide.Annexe";
    Doc annex = new Doc(f.wiki, annexRef); annex.title = "Page annexe"; annex.saveAsAuthor("Fixture", true);
    String physicalSnapshot = f.deletionSnapshot(GUIDE);
    check(f.pageOutput.contains("data-ref=\"" + physicalChildRef + "\"") && f.pageOutput.contains("data-ref=\"" + annexRef + "\""), "The preview must include physical descendants and non-docClass terminal pages");
    check(!f.pageOutput.contains("data-ref=\"" + logicalOnlyRef + "\""), "Logical children outside the deleted physical space must not be advertised as deleted");
    check(f.post("supprimer element", "source_ref", GUIDE).equals("ERREUR_CONFLIT_SUPPRESSION"), "Deep deletion requires the exact preview confirmation");
    physicalChild.saveAsAuthor("Changed after preview", true);
    check(f.post("supprimer element", "source_ref", GUIDE, "delete_snapshot", physicalSnapshot).equals("ERREUR_CONFLIT_SUPPRESSION"), "A descendant version change invalidates the confirmation");
    physicalSnapshot = f.deletionSnapshot(GUIDE);
    check(f.post("supprimer element", "source_ref", GUIDE, "delete_snapshot", physicalSnapshot).equals("SUPPRESSION_OK"), "Confirmed current physical descendants must delete");
    check(!f.wiki.docs.containsKey(physicalChildRef) && !f.wiki.docs.containsKey(annexRef) && f.wiki.docs.containsKey(logicalOnlyRef), "The confirmed preview must match the native deep deletion scope");
    done("Folder confirmation previews physical descendants and annexes, excludes logical outsiders and rejects stale snapshots");

    for (String incomplete : List.of("hidden", "protected", "limit")) {
      f = operationFixture("deleteGroups"); f.wiki.docs.get(GUIDE).getObject(DOCUMENT_CLASS).set("type", "folder");
      if (incomplete.equals("limit")) {
        for (int index = 0; index < 500; index++) f.document("TestPage.PAGE.doc-test.Guide.Enfant" + index + ".WebHome", "document", "Enfant " + index);
      } else {
        String ref = incomplete.equals("protected") ? "TestPage.PAGE.doc-test.Guide.CODE.WebHome" : physicalChildRef;
        f.document(ref, "document", "Confidentiel"); if (incomplete.equals("hidden")) f.wiki.hiddenRefs.add(ref);
      }
      f.request.params.clear(); f.request.params.put("source_ref", GUIDE); f.list("apercu suppression");
      check(f.pageOutput.contains("data-complete=\"false\"") && !f.pageOutput.contains("deletion-node-data") && !f.pageOutput.contains("Confidentiel"), "Incomplete " + incomplete + " previews must fail closed without leaking hidden titles");
      check(f.post("supprimer element", "source_ref", GUIDE, "delete_snapshot", "forged").equals("ERREUR_APERCU_SUPPRESSION") && f.refactoring.deleteCalls == 0, "Incomplete " + incomplete + " previews cannot start a native delete");
      done("Folder deletion fails closed for " + incomplete + " physical descendants");
    }

    f = operationFixture("deleteGroups"); f.wiki.docs.get(GUIDE).getObject(DOCUMENT_CLASS).set("type", "folder");
    Doc childNotDeleted = f.document(physicalChildRef, "document", "Enfant"); childNotDeleted.parent = GUIDE;
    String partialDeleteSnapshot = f.deletionSnapshot(GUIDE); f.refactoring.partialDelete = true;
    result = f.post("supprimer element", "source_ref", GUIDE, "delete_snapshot", partialDeleteSnapshot);
    check(result.equals("ERREUR_SUPPRESSION") && !f.wiki.docs.containsKey(GUIDE) && f.wiki.docs.containsKey(physicalChildRef), "A native deletion removing only the root must report an incomplete operation");
    check(!f.pageOutput.contains("SUPPRESSION_OK"), "Partial native deletion cannot show a successful result");
    done("A native delete leaving a descendant cannot report a complete suppression");

    for (String brokenStorage : List.of("renderer absent", "renderer empty", "source absent", "source String", "source disabled")) {
      f = operationFixture("createGroups");
      switch (brokenStorage) {
        case "renderer absent" -> f.wiki.rendererAvailable = false;
        case "renderer empty" -> f.wiki.rendererEmpty = true;
        case "source absent" -> f.wiki.contentSchema.properties.remove("source");
        case "source String" -> f.wiki.contentSchema.properties.put("source", new Definition("String"));
        case "source disabled" -> f.wiki.contentSchema.properties.get("source").disabled = true;
      }
      Map<String, Integer> before = revisions(f);
      result = f.post("ajouter un document", "type", "document", "page", MAIN, "nom_fichier", "Document", "content", "Texte");
      check(result.equals(brokenStorage.startsWith("renderer") ? "ERREUR_RENDU_CONTENU" : "ERREUR_CLASSE_CONTENU") && revisions(f).equals(before), "Broken " + brokenStorage + " must produce a clear error before publishing: " + result);
      done("Document creation rejects " + brokenStorage + " before publishing a blank page");
    }
    f = operationFixture("proposeGroups"); f.wiki.rendererAvailable = false;
    check(f.post("ajouter un fichier", "type", "folder", "page", MAIN, "nom_fichier", "Dossier vide").equals("PROPOSITION_OK"), "An empty proposed folder does not require a document renderer");
    done("Empty proposed folders remain available without a document renderer");

    f = operationFixture("proposeGroups");
    String preflightChange = stage(f, "modifier contenu document", "source_ref", GUIDE, "base_version", f.wiki.docs.get(GUIDE).getVersion(), "content", "Contenu à valider");
    check(amend(f, preflightChange, "Guide déplacé", TARGET, "").equals("PROPOSITION_MODIFIEE_OK"), "A content amendment can be prepared before testing a missing renderer");
    f.group("reviewGroups", "XWiki.Validators"); f.wiki.rendererAvailable = false;
    result = f.post("valider proposition", "proposal_ref", preflightChange, "version", f.wiki.docs.get(preflightChange).getVersion());
    check(result.equals("ERREUR_RENDU_CONTENU") && f.refactoring.moveCalls == 0 && f.wiki.docs.containsKey(GUIDE), "Storage preflight must fail before moving a source that cannot render its accepted content");
    done("A relocated content proposal checks its renderer before starting the native move");
    System.out.println(scenarios + " Velocity scenarios passed (XWiki APIs simulated).");
  }
}
