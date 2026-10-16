import com.xpn.xwiki.XWikiContext;
import com.xpn.xwiki.internal.filter.*;
import com.xpn.xwiki.internal.filter.input.*;
import com.xpn.xwiki.internal.filter.output.PropertyClassOutputFilterStream;
import com.xpn.xwiki.objects.BaseObject;
import com.xpn.xwiki.objects.classes.*;
import com.xpn.xwiki.objects.meta.*;
import java.io.StringWriter;
import java.lang.reflect.Proxy;
import java.nio.file.*;
import java.util.*;
import javax.inject.Provider;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamReader;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.VelocityEngine;
import org.slf4j.LoggerFactory;
import org.xwiki.component.manager.ComponentManager;
import org.xwiki.filter.FilterEventParameters;
import org.xwiki.filter.event.xwiki.XWikiWikiDocumentFilter;
import org.xwiki.filter.instance.input.DocumentInstanceInputProperties;
import org.xwiki.filter.output.StringWriterOutputTarget;
import org.xwiki.filter.xar.input.XARInputProperties;
import org.xwiki.filter.xar.internal.input.ClassPropertyReader;
import org.xwiki.filter.xar.internal.input.ClassReader;
import org.xwiki.filter.xar.internal.output.XAROutputFilterStream;
import org.xwiki.filter.xar.output.XAROutputProperties;
import org.xwiki.model.EntityType;
import org.xwiki.model.reference.*;
import org.xwiki.rendering.syntax.Syntax;

/**
 * Native XWiki 16.10.17 regression for the importable class repair package. Requires the XWiki
 * oldcore/filter/XAR modules and Apache Velocity on the classpath. Run from the repository root;
 * --generate refreshes the XML using native XWiki
 * BaseClassEventGenerator/PropertyClassEventGenerator/XAROutputFilterStream, the same native
 * serialization pipeline used by BaseClass.toXML(). The Python INSTALL/build_proposal_class_xar.py
 * then rebuilds the deterministic ZIP.
 */
public class DocumentationXWikiClassTest {
  static String REF = "TestPage.PAGE.doc-test.CODE.docPropositionClass.WebHome";
  static List<String> FIELDS =
      List.of(
          "operation",
          "type",
          "title",
          "parentRef",
          "parentProposalRef",
          "sourceRef",
          "baseVersion",
          "content",
          "description",
          "tags",
          "author",
          "submittedAt",
          "status",
          "reviewer",
          "reviewComment",
          "reviewedAt",
          "deletedAt",
          "publishedRef",
          "batchId",
          "filename",
          "kind",
          "sourceProposalId");
  static List<String> DATES = List.of("submittedAt", "reviewedAt", "deletedAt"),
      TEXT = List.of("content", "description", "tags", "reviewComment");

  static void inject(Object o, Class<?> owner, String n, Object v) throws Exception {
    var f = owner.getDeclaredField(n);
    f.setAccessible(true);
    f.set(o, v);
  }

  public static class Writer extends XAROutputFilterStream implements BaseClassFilter {}

  static String exportNative() throws Exception {
    BaseClass def = new BaseClass();
    def.setDocumentReference(
        new DocumentReference(
            "xwiki",
            List.of("TestPage", "PAGE", "doc-test", "CODE", "docPropositionClass"),
            "WebHome"));
    inject(def, com.xpn.xwiki.objects.BaseElement.class, "name", REF);
    int count = 1;
    for (String f : FIELDS) {
      if (DATES.contains(f)) {
        def.addDateField(f, f);
        ((DateClass) def.get(f)).setEmptyIsToday(0);
      } else if (TEXT.contains(f)) {
        def.addTextAreaField(f, f, 80, 8);
        ((TextAreaClass) def.get(f)).setContentType("PureText");
        ((TextAreaClass) def.get(f)).setEditor("PureText");
      } else {
        def.addTextField(f, f, 60);
      }
      ((PropertyClass) def.get(f)).setNumber(count++);
    }
    var generator = new BaseClassEventGenerator();
    inject(
        generator,
        BaseClassEventGenerator.class,
        "propertyEventGenerator",
        new PropertyClassEventGenerator());
    var writer = new Writer();
    var props = new XAROutputProperties();
    var target = new StringWriterOutputTarget();
    props.setTarget(target);
    props.setFormat(true);
    props.setForceDocument(true);
    props.setPreserveVersion(true);
    writer.setProperties(props);
    EntityReferenceSerializer<String> serializer =
        (reference, params) -> {
          var names = new ArrayList<String>();
          for (EntityReference ref = reference;
              ref != null && ref.getType() != EntityType.WIKI;
              ref = ref.getParent()) {
            names.add(0, ref.getName());
          }
          return String.join(".", names);
        };
    inject(writer, XAROutputFilterStream.class, "localSerializer", serializer);
    inject(writer, XAROutputFilterStream.class, "defaultSerializer", serializer);
    for (String s : List.of("TestPage", "PAGE", "doc-test", "CODE", "docPropositionClass"))
      writer.beginWikiSpace(s, FilterEventParameters.EMPTY);
    writer.beginWikiDocument("WebHome", FilterEventParameters.EMPTY);
    writer.beginWikiDocumentLocale(Locale.ROOT, FilterEventParameters.EMPTY);
    var rev = new FilterEventParameters();
    rev.put(XWikiWikiDocumentFilter.PARAMETER_TITLE, "Classe des propositions documentaires");
    rev.put(XWikiWikiDocumentFilter.PARAMETER_HIDDEN, true);
    rev.put(XWikiWikiDocumentFilter.PARAMETER_SYNTAX, Syntax.XWIKI_2_1);
    rev.put(XWikiWikiDocumentFilter.PARAMETER_CONTENT, "");
    writer.beginWikiDocumentRevision("1.1", rev);
    generator.write(def, writer, writer, new DocumentInstanceInputProperties());
    writer.endWikiDocumentRevision("1.1", rev);
    writer.endWikiDocumentLocale(Locale.ROOT, FilterEventParameters.EMPTY);
    writer.endWikiDocument("WebHome", FilterEventParameters.EMPTY);
    writer.close();
    return target.toString();
  }

  static BaseClass readNative(Path path) throws Exception {
    XMLInputFactory factory = XMLInputFactory.newFactory();
    factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
    factory.setProperty("javax.xml.stream.isSupportingExternalEntities", false);
    XMLStreamReader xml = factory.createXMLStreamReader(Files.newBufferedReader(path));
    while (xml.hasNext()) {
      xml.next();
      if (xml.isStartElement() && xml.getLocalName().equals("class")) break;
    }
    var reader = new ClassReader();
    inject(reader, ClassReader.class, "propertyReader", new ClassPropertyReader());
    var imported = reader.read(xml, new XARInputProperties());
    var providers =
        Map.of(
            "String",
            new StringMetaClass(),
            "TextArea",
            new TextAreaMetaClass(),
            "Date",
            new DateMetaClass());
    ComponentManager components =
        (ComponentManager)
            Proxy.newProxyInstance(
                ComponentManager.class.getClassLoader(),
                new Class[] {ComponentManager.class},
                (proxy, method, args) -> {
                  String name = args.length > 1 ? args[args.length - 1].toString() : "";
                  if (method.getName().equals("hasComponent")) return providers.containsKey(name);
                  if (method.getName().equals("getInstance")) return providers.get(name);
                  throw new UnsupportedOperationException(method.getName());
                });
    var filter = new PropertyClassOutputFilterStream();
    inject(
        filter,
        PropertyClassOutputFilterStream.class,
        "componentManagerProvider",
        (Provider<ComponentManager>) () -> components);
    inject(
        filter, PropertyClassOutputFilterStream.class, "logger", LoggerFactory.getLogger("native"));
    BaseClass result = new BaseClass();
    filter.setCurrentXClass(result);
    for (var p : imported.properties.values()) {
      filter.beginWikiClassProperty(p.name, p.type, p.parameters);
      for (var f : p.fields.entrySet())
        filter.onWikiClassPropertyField(f.getKey(), f.getValue(), FilterEventParameters.EMPTY);
      filter.endWikiClassProperty(p.name, p.type, p.parameters);
      result.safeput(p.name, filter.getEntity());
      filter.setEntity(null);
    }
    xml.close();
    if (!REF.equals(imported.name)) throw new AssertionError("Wrong imported class reference");
    return result;
  }

  // The only substituted service is storage lookup / context injection. All class,
  // property definitions, XAR readers/writers and Velocity execution are native.
  public static class NativeObject extends com.xpn.xwiki.api.Object {
    NativeObject(BaseClass definition) {
      super(
          new BaseObject() {
            @Override
            public BaseClass getXClass(XWikiContext context) {
              return definition;
            }
          },
          null);
    }

    @Override
    protected XWikiContext getXWikiContext() {
      return null;
    }

    @Override
    public com.xpn.xwiki.api.Class getxWikiClass() {
      var result = super.getxWikiClass();
      try {
        inject(
            result,
            com.xpn.xwiki.api.Api.class,
            "xcontextProvider",
            (Provider<XWikiContext>) () -> null);
      } catch (Exception error) {
        throw new RuntimeException(error);
      }
      return result;
    }
  }

  static String checkMacro(BaseClass definition, String source) throws Exception {
    String macros =
        source.substring(
            source.indexOf("#macro(docError"), source.indexOf("## Références locales uniquement"));
    VelocityContext context = new VelocityContext();
    context.put("proposalFields", FIELDS);
    context.put("proposalDateFields", DATES);
    context.put("proposalTextFields", TEXT);
    context.put("errorCode", "");
    context.put("errorMessage", "");
    context.put("object", new NativeObject(definition));
    VelocityEngine engine = new VelocityEngine();
    engine.setProperty(
        "introspector.uberspect.class", "org.xwiki.velocity.introspection.SecureUberspector");
    engine.setProperty("directive.if.empty_check", false);
    engine.setProperty("velocimacro.enable_bc_mode", true);
    engine.setProperty("velocimacro.permissions.allow.inline.local.scope", true);
    engine.setProperty("parser.space_gobbling", "bc");
    engine.init();
    StringWriter output = new StringWriter();
    engine.evaluate(
        context, output, "native-proposal-class", macros + "#checkProposalClass($object)");
    return context.get("errorCode") + " " + context.get("errorMessage");
  }

  static void require(boolean ok, String message) {
    if (!ok) throw new AssertionError(message);
  }

  public static void main(String[] args) throws Exception {
    Path install = Path.of("xwiki/TestPage/PAGE/doc-test/INSTALL");
    Path xml = install.resolve("docPropositionClass.xml");
    if (args.length > 0 && args[0].equals("--generate")) Files.writeString(xml, exportNative());
    require(
        exportNative().equals(Files.readString(xml)),
        "Reviewable XML must match the native XWiki exporter");
    BaseClass definition = readNative(xml);
    require(
        definition.getPropertyNames().length == 22, "Import must contain the 22 required fields");
    for (String field : FIELDS) {
      var property = (PropertyClass) definition.get(field);
      String expected =
          DATES.contains(field) ? "Date" : TEXT.contains(field) ? "TextArea" : "String";
      require(
          property != null && expected.equals(property.getClassType()) && !property.isDisabled(),
          "Wrong field: " + field);
      if (property instanceof TextAreaClass text)
        require("puretext".equals(text.getContentType()), "Unsafe content type: " + field);
      if (property instanceof DateClass date)
        require(date.getEmptyIsToday() == 0, "Optional dates must stay empty");
    }
    String source = Files.readString(Path.of("xwiki/TestPage/PAGE/doc-test/COMMANDE.xwiki"));
    require(
        checkMacro(definition, source).isBlank(),
        "Actual class validation must accept the imported class");
    BaseClass missing = readNative(xml);
    missing.removeField("title");
    require(
        checkMacro(missing, source).contains("title"),
        "Actual class validation must reject missing title");
    BaseClass disabled = readNative(xml);
    ((PropertyClass) disabled.get("title")).setDisabled(true);
    require(
        checkMacro(disabled, source).contains("désactivé"),
        "Actual validation must reject a disabled title");
    BaseClass wrongType = readNative(xml);
    wrongType.removeField("title");
    wrongType.addTextAreaField("title", "title", 60, 3);
    require(
        checkMacro(wrongType, source).contains("type incorrect"),
        "Actual validation must reject the wrong title type");
    System.out.println("8 native XWiki class/export/import/Velocity checks passed.");
  }
}
