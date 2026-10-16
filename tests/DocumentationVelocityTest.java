import java.io.StringWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.SimpleDateFormat;
import java.util.*;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.VelocityEngine;

/** Executes the actual permissions template with a small simulated XWiki API.
 * Run from the repository root: java -cp '/path/to/velocity-jars/*' tests/DocumentationVelocityTest.java
 * Required jars: Velocity 2.3, commons-lang3, slf4j-api.
 * This exercises Velocity and permission decisions, not a deployed XWiki server.
 */
public class DocumentationVelocityTest {
  static final Path ROOT = Path.of("xwiki/TestPage/PAGE/doc-test");
  static final String CONFIG_CLASS = "TestPage.PAGE.doc-test.CODE.docConfigurationClass.WebHome";
  static final String PROPOSAL_CLASS = "TestPage.PAGE.doc-test.CODE.docPropositionClass.WebHome";
  static final String DOCUMENT_CLASS = "TestPage.PAGE.Doc.CODE.docClass.WebHome";
  static final String MAIN = "TestPage.PAGE.doc-test.WebHome";
  static final String PROPOSALS = "TestPage.PAGE.doc-test.PROPOSITIONS";
  static final String TRASH = "TestPage.PAGE.doc-test.CORBEILLE";
  static final long NOW = 1792137600000L, WEEK = 604800000L;
  static final VelocityEngine ENGINE = new VelocityEngine();
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
    public Object getValue(String name) { return fields.getOrDefault(name, ""); }
    public void set(String name, Object value) { fields.put(name, value); }
  }
  public static class Doc {
    final Obj configuration = new Obj();
    final Map<String, List<Obj>> objects = new LinkedHashMap<>();
    final Wiki owner; final String reference;
    String content = "", title = "", parent = ""; int revision;
    Doc() { this(null, "TestPage.PAGE.doc-test.CODE.Configuration.WebHome"); }
    Doc(Wiki owner, String reference) { this.owner = owner; this.reference = reference; }
    public Obj getObject(String name) { return name.equals(CONFIG_CLASS) ? configuration : objects.getOrDefault(name, List.of()).stream().findFirst().orElse(null); }
    public Obj newObject(String name) { Obj value = new Obj(); objects.computeIfAbsent(name, ignored -> new ArrayList<>()).add(value); return value; }
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
    public List<Object> getAttachmentList() { return List.of(); }
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
    final Doc config = new Doc();
    final Map<String, Doc> docs = new LinkedHashMap<>();
    final List<String> deleted = new ArrayList<>();
    int unique;
    boolean admin, serviceAdmin = true, visible = true, nativeEdit, nativeDelete, readableConfiguration = true;
    public boolean hasWikiAdminRights() { return admin; }
    public boolean hasAccessLevel(String level, String user, String ref) {
      return switch (level) { case "admin" -> user.equals("XWiki.ScriptAuthor") ? serviceAdmin : admin; case "view" -> visible; case "edit" -> nativeEdit; case "delete" -> nativeDelete; default -> false; };
    }
    public Doc getDocumentAsAuthor(String ref) {
      if (ref.equals("TestPage.PAGE.doc-test.CODE.Configuration.WebHome")) return readableConfiguration ? config : null;
      return docs.getOrDefault(ref, new Doc(this, ref));
    }
    public Doc getDocumentAsAuthor(Ref ref) { return getDocumentAsAuthor(ref.toString()); }
    public Doc getDocument(String ref) { return getDocumentAsAuthor(ref); }
    public Doc getDocument(Ref ref) { return getDocumentAsAuthor(ref); }
    public String getUniquePageName(String space) { return "P" + (++unique); }
    public String formatDate(Date value, String format) { return new SimpleDateFormat(format).format(value); }
  }
  public static class UserContext {
    Ref user = new Ref("xwiki", "XWiki.Alice");
    public Ref getUserReference() { return user; }
    public String getUser() { return user.toString(); }
  }
  public static class DateTool {
    public Date getDate() { return new Date(NOW); }
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
    Queries(Wiki wiki) { this.wiki = wiki; }
    public Queries hql(String query) { return this; }
    public Queries bindValue(String name, Object value) { return this; }
    public List<String> execute() { return new ArrayList<>(wiki.docs.keySet()); }
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
    public String getD() { return "$"; }
    public String getH() { return "#"; }
  }
  public static class Csrf {
    public boolean isTokenValid(String value) { return value.equals("test-token"); }
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
    VelocityContext context;
    void configured() { wiki.config.configuration.set("schemaVersion", "1"); }
    void group(String field, String reference) {
      wiki.config.configuration.set(field, reference);
      users.group.members.add(model.resolveDocument(reference));
    }
    void render() throws Exception {
      context = new VelocityContext();
      context.put("xwiki", wiki); context.put("xcontext", user); context.put("datetool", new DateTool());
      context.put("services", Map.of("model", model, "user", users, "query", new Queries(wiki), "csrf", new Csrf()));
      context.put("request", request); context.put("escapetool", new Escape());
      context.put("doc", new Doc(wiki, "TestPage.PAGE.doc-test.COMMANDE")); context.put("stringtool", new Strings());
      String source = Files.readString(ROOT.resolve("CODE/Permissions.xwiki"));
      int first = source.indexOf("}}") + 2, last = source.lastIndexOf("{{/velocity}}");
      StringWriter output = new StringWriter();
      ENGINE.evaluate(context, output, "documentation permissions", source.substring(first, last) + "\n#documentationPermissions()\n");
    }
    boolean can(String right) { return Boolean.TRUE.equals(context.get("can" + right)); }
    void trash(String ref, String status, Long deletedAt) { wiki.docs.put(ref, new TrashDoc(wiki, ref, status, deletedAt)); }
    void purge() throws Exception {
      render();
      commandMacros();
      ENGINE.evaluate(context, new StringWriter(), "documentation purge", "#purgeExpiredProposals()");
    }
    void commandMacros() throws Exception {
      String command = Files.readString(ROOT.resolve("COMMANDE.xwiki"));
      int first = command.indexOf("}}") + 2, last = command.indexOf("#if($request.getMethod() == 'POST')");
      if (last < 0) throw new AssertionError("Cannot find command dispatcher after the real macro definitions");
      String macros = command.substring(first, last).replace("#includeMacros('TestPage.PAGE.doc-test.CODE.Permissions')", "");
      ENGINE.evaluate(context, new StringWriter(), "documentation macro registration", macros);
    }
    String list(String action) throws Exception {
      request.action = action; request.method = "GET"; render(); commandMacros();
      String command = Files.readString(ROOT.resolve("COMMANDE.xwiki"));
      int first = command.indexOf("{{velocity}}") + "{{velocity}}".length(), last = command.lastIndexOf("{{/velocity}}");
      StringWriter output = new StringWriter();
      ENGINE.evaluate(context, output, "documentation listing", command.substring(first, last));
      return output.toString();
    }
    String post(String action, String... pairs) throws Exception {
      request.action = action; request.method = "POST"; request.params.clear(); request.params.put("form_token", "test-token");
      for (int index = 0; index < pairs.length; index += 2) request.params.put(pairs[index], pairs[index + 1]);
      render();
      String command = Files.readString(ROOT.resolve("COMMANDE.xwiki"));
      String body = command.substring(command.indexOf("}}") + 2, command.indexOf("{{/velocity}}"))
          .replace("#includeMacros('TestPage.PAGE.doc-test.CODE.Permissions')", "");
      ENGINE.evaluate(context, new StringWriter(), "documentation POST", body);
      return String.valueOf(context.get("errorCode")).isEmpty() ? String.valueOf(context.get("resultCode")) : String.valueOf(context.get("errorCode"));
    }
    Doc document(String ref, String type, String title) {
      Doc value = new Doc(wiki, ref); Obj metadata = value.newObject(DOCUMENT_CLASS);
      metadata.set("type", type); value.title = title; value.parent = MAIN; value.saveAsAuthor("Fixture", true); return value;
    }
  }

  static void check(boolean valid, String label) { if (!valid) throw new AssertionError(label); }
  static void done(String label) { scenarios++; System.out.println("PASS: " + label); }
  static void denyWrites(Fixture f) {
    for (String right : List.of("Create", "Move", "Modify", "Import", "Content", "Propose", "Review", "Delete"))
      check(!f.can(right), "Unexpected permission: " + right);
  }
  public static void main(String[] args) throws Exception {
    ENGINE.init();
    Fixture f = new Fixture(); f.wiki.admin = true; f.configured(); f.render();
    for (String right : List.of("Configure", "Create", "Move", "Modify", "Import", "Content", "Propose", "Review", "Delete"))
      check(f.can(right), "Admin permission missing: " + right);
    done("Administrators receive settings and all documentation permissions");

    f = new Fixture(); f.wiki.nativeEdit = true; f.wiki.nativeDelete = true; f.render();
    check(f.can("Create") && f.can("Content") && f.can("Move") && f.can("Delete") && f.can("Propose"), "Initial native permissions lost");
    check(!f.can("Configure") && !f.can("Review"), "Native editors cannot configure or validate");
    done("Initial configuration retains native editor rights without granting settings or validation");

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

    f = new Fixture(); f.wiki.admin = true;
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
    f.wiki.admin = true; listed = f.list("propositions");
    check(listed.contains("data-ref=\"" + theirs + "\""), "Validators must see pending proposals from other authors");
    done("Real proposal listing scopes private data to its author or a validator");

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
    f.wiki.admin = true;
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

    f.wiki.admin = false;
    result = f.post("ajouter un document", "mode", "proposal", "type", "document", "page", MAIN, "nom_fichier", "À revoir", "content", "Brouillon");
    check(result.equals("PROPOSITION_OK"), "Review fixture creation failed: " + result);
    String refusedRef = String.valueOf(f.context.get("resultProposalRef"));
    String version = f.wiki.docs.get(refusedRef).getVersion();
    result = f.post("refuser proposition", "proposal_ref", refusedRef, "version", version, "comment", "Incomplet");
    check(result.equals("ERREUR_DROITS"), "A proposer cannot refuse a proposal without validation right");
    f.wiki.admin = true;
    result = f.post("refuser proposition", "proposal_ref", refusedRef, "version", "stale", "comment", "Incomplet");
    check(result.equals("ERREUR_CONFLIT_VERSION"), "A stale review must not move a proposal");
    result = f.post("refuser proposition", "proposal_ref", refusedRef, "version", version, "comment", "Incomplet");
    check(result.equals("PROPOSITION_REFUSEE_OK"), "Refusal failed: " + result);
    String trashRef = String.valueOf(f.context.get("resultRef"));
    check(trashRef.startsWith(TRASH + ".") && !f.wiki.docs.containsKey(refusedRef), "Refused page must move from PROPOSITIONS to CORBEILLE");
    Obj refused = f.wiki.docs.get(trashRef).getObject(PROPOSAL_CLASS);
    check(refused.getValue("status").equals("rejected") && refused.getValue("reviewComment").equals("Incomplet"), "Refusal status and reason must be stored");
    check(((Date)refused.getValue("deletedAt")).getTime() == NOW, "Trash retention must begin when refusal is saved");
    f.wiki.admin = false;
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

    f = new Fixture(); f.configured(); f.group("proposeGroups", "XWiki.Contributors");
    String sourceRef = "TestPage.PAGE.doc-test.Guide.WebHome";
    Doc source = f.document(sourceRef, "document", "Guide"); source.content = "Texte original";
    source.getObject(DOCUMENT_CLASS).set("description", "Description originale");
    result = f.post("modifier metadonnees document", "mode", "proposal", "source_ref", sourceRef,
      "base_version", source.getVersion(), "description", "Description proposée", "tags", "Nouveau tag");
    check(result.equals("PROPOSITION_OK"), "Metadata proposal failed: " + result);
    String metadataProposal = String.valueOf(f.context.get("resultProposalRef"));
    check(source.content.equals("Texte original") && source.getObject(DOCUMENT_CLASS).getValue("description").equals("Description originale"), "Proposing metadata must preserve published content and metadata");
    f.wiki.admin = true;
    result = f.post("valider proposition", "proposal_ref", metadataProposal, "version", f.wiki.docs.get(metadataProposal).getVersion());
    check(result.equals("PROPOSITION_VALIDEE_OK"), "Metadata validation failed: " + result);
    check(source.getObject(DOCUMENT_CLASS).getValue("description").equals("Description proposée"), "Accepted metadata must update the existing document");
    check(source.getObject("TestPage.PAGE.doc-test.CODE.docContentClass.WebHome").getValue("source").equals("Texte original"), "Wrapping the original document must preserve its text");
    done("Real metadata proposal leaves the document unchanged until validation and retains its existing content");

    f.wiki.admin = false;
    result = f.post("modifier contenu document", "mode", "proposal", "source_ref", sourceRef,
      "base_version", source.getVersion(), "content", "Texte {{/velocity}} proposé ERREUR_CSRF");
    check(result.equals("PROPOSITION_OK"), "Content proposal failed: " + result);
    String contentProposal = String.valueOf(f.context.get("resultProposalRef"));
    check(source.getObject("TestPage.PAGE.doc-test.CODE.docContentClass.WebHome").getValue("source").equals("Texte original"), "Content proposals cannot modify the published source");
    source.saveAsAuthor("Concurrent edit", true);
    f.wiki.admin = true;
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
    ENGINE.evaluate(f.context, new StringWriter(), "moved document identifiers", "#updateMovedDocumentIds($movedRootForTest)");
    check(moved.getObject(DOCUMENT_CLASS).getValue("id").equals(movedFolder), "Moved folder id must match its native reference");
    check(child.getObject(DOCUMENT_CLASS).getValue("id").equals(movedChild), "Descendant id must match its native reference");
    check(child.content.equals("Contenu conservé") && foreign.getObject(DOCUMENT_CLASS).getValue("id").equals("à conserver"), "Updating identifiers must preserve content and ignore foreign pages");
    done("Native moves retain correct docClass identifiers for the folder and its descendants");
    System.out.println(scenarios + " Velocity scenarios passed (XWiki APIs simulated).");
  }
}
