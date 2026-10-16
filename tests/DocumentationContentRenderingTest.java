import java.io.StringWriter;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import javax.inject.Provider;

import com.xpn.xwiki.XWikiContext;
import com.xpn.xwiki.objects.BaseObject;
import com.xpn.xwiki.objects.classes.BaseClass;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.VelocityEngine;

/**
 * Runs the content sheet with native XWiki property APIs and the secure Velocity introspector.
 * The restricted rendering boundary is recorded, rather than running an XWiki server.
 * Run with XWiki oldcore 16.10.17, its dependencies, and Velocity on the classpath.
 */
public class DocumentationContentRenderingTest {
    static final String CONTENT_CLASS = "TestPage.PAGE.doc-test.CODE.docContentClass.WebHome";
    static final Field CONTEXT_PROVIDER;
    static final VelocityEngine ENGINE = new VelocityEngine();
    static final String TEMPLATE;
    static int passed;

    static {
        try {
            CONTEXT_PROVIDER = com.xpn.xwiki.api.Api.class.getDeclaredField("xcontextProvider");
            CONTEXT_PROVIDER.setAccessible(true);
            String source = Files.readString(Path.of("xwiki/TestPage/PAGE/doc-test/CODE/DocumentContent.xwiki"));
            TEMPLATE = source.substring("{{velocity}}".length(), source.lastIndexOf("{{/velocity}}"));
            ENGINE.setProperty("introspector.uberspect.class", "org.xwiki.velocity.introspection.SecureUberspector");
            ENGINE.setProperty("directive.if.empty_check", false);
            ENGINE.setProperty("velocimacro.enable_bc_mode", true);
            ENGINE.setProperty("velocimacro.permissions.allow.inline.local.scope", true);
            ENGINE.setProperty("parser.space_gobbling", "bc");
            ENGINE.init();
        } catch (Exception error) {
            throw new ExceptionInInitializerError(error);
        }
    }

    static <T extends com.xpn.xwiki.api.Api> T context(T api) {
        if (api != null) {
            try {
                CONTEXT_PROVIDER.set(api, (Provider<XWikiContext>) () -> null);
            } catch (IllegalAccessException error) {
                throw new AssertionError(error);
            }
        }
        return api;
    }

    public static class NativeContentObject extends com.xpn.xwiki.api.Object {
        NativeContentObject(BaseClass definition, String value) {
            super(new BaseObject() {
                @Override public BaseClass getXClass(XWikiContext context) { return definition; }
            }, null);
            // Keep the real TextArea/String property and API getValue() conversion.
            getBaseObject().setLargeStringValue("source", value);
        }

        @Override protected XWikiContext getXWikiContext() { return null; }
        @Override public com.xpn.xwiki.api.Class getxWikiClass() {
            return context(super.getxWikiClass());
        }
        @Override public com.xpn.xwiki.api.Property getProperty(String name) {
            return context(super.getProperty(name));
        }
    }

    public static class Document {
        final NativeContentObject content;
        String renderedSource;
        String renderedSyntax;
        int renderCalls;
        String renderedHtml = "<p>Contenu importé</p>";
        Document(NativeContentObject content) { this.content = content; }
        public NativeContentObject getObject(String className) {
            check(CONTENT_CLASS.equals(className), "The sheet must read the canonical content class");
            return content;
        }
        public String getRenderedContentRestricted(String source, String syntax) {
            renderCalls++;
            renderedSource = source;
            renderedSyntax = syntax;
            return renderedHtml;
        }
    }

    static BaseClass definition(String type, boolean disabled) {
        BaseClass definition = new BaseClass();
        if (type.equals("TextArea")) definition.addTextAreaField("source", "Source", 80, 10);
        else if (type.equals("String")) definition.addTextField("source", "Source", 30);
        if (!type.equals("missing"))
            ((com.xpn.xwiki.objects.classes.PropertyClass) definition.get("source")).setDisabled(disabled);
        return definition;
    }

    static String render(Document document) {
        VelocityContext context = new VelocityContext();
        context.put("doc", document);
        StringWriter output = new StringWriter();
        ENGINE.evaluate(context, output, "DocumentContent", TEMPLATE);
        return output.toString();
    }

    static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    static void pass(String message) {
        passed++;
        System.out.println("PASS: " + message);
    }

    public static void main(String[] args) {
        for (String source : List.of("**Texte importé**", "{{pdf filename=\"guide.pdf\"/}}",
                "[[Télécharger le fichier>>attach:guide.txt]]", "{{velocity}}$untrusted{{/velocity}}", "")) {
            Document document = new Document(new NativeContentObject(definition("TextArea", false), source));
            String output = render(document);
            check(document.renderCalls == 1 && source.equals(document.renderedSource),
                "The native TextArea value must reach the restricted renderer unchanged: " + source);
            check("xwiki/2.1".equals(document.renderedSyntax), "The source syntax must be explicit");
            check(output.contains(document.renderedHtml) && !output.contains("warningmessage"),
                "A valid content object must show the rendered result");
        }
        pass("native TextArea values, PDFs, attachment links, scripts and blank content use restricted rendering");

        Document missing = new Document(null);
        check(render(missing).contains("objet docContentClass est absent") && missing.renderCalls == 0,
            "A missing content object must produce an actionable warning");
        pass("a missing content object is explained instead of producing an empty page");

        for (String type : List.of("missing", "String", "TextArea")) {
            Document invalid = new Document(new NativeContentObject(definition(type, type.equals("TextArea")), "source"));
            check(render(invalid).contains("champ source doit être une zone de texte (TextArea) active")
                    && invalid.renderCalls == 0,
                "A missing, wrong-type or disabled source field must be explained: " + type);
        }
        pass("missing, wrong-type and disabled source definitions are explained");

        Document braces = new Document(new NativeContentObject(definition("TextArea", false), "text"));
        braces.renderedHtml = "<p>{{/html}}{{velocity}}bad{{/velocity}}</p>";
        String output = render(braces);
        check(output.contains("&#123;&#123;/html&#125;&#125;") && !output.contains("{{velocity}}bad"),
            "Rendered content must not close the trusted HTML envelope");
        pass("rendered macro delimiters cannot escape the HTML envelope");

        System.out.println(passed + " content rendering scenarios passed with native XWiki property APIs.");
    }
}
