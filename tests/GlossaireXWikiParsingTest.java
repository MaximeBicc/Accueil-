import java.io.StringReader;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.velocity.Template;
import org.apache.velocity.runtime.RuntimeInstance;
import org.apache.velocity.runtime.parser.ParseException;
import org.xwiki.rendering.wikimodel.IWemListener;
import org.xwiki.rendering.wikimodel.xwiki.xwiki21.XWikiParser;

/**
 * Vérifie les vrais parseurs XWiki 2.1 et Velocity, sans exécuter les scripts.
 *
 * Dépendances : xwiki-rendering-wikimodel 16.10.17 et les JAR du moteur
 * Velocity (2.3 ou 1.7). Exemple depuis la racine du dépôt :
 * java -cp '/chemin/jars/*' tests/GlossaireXWikiParsingTest.java
 *
 * Les contrôles négatifs prouvent que le test détecte un #end perdu lors d'une
 * copie et une enveloppe incomplète. Ils ne diagnostiquent pas le wiki installé.
 */
public class GlossaireXWikiParsingTest {
  static final Path ROOT = Path.of("xwiki/TestPage/PAGE/Glossaire");
  static final Pattern VELOCITY_ENVELOPE = Pattern.compile(
      "\\A\\{\\{velocity(?:[ \\t]+[^{}\\r\\n]*)?}}\\n([\\s\\S]*)\\n\\{\\{/velocity}}[ \\t\\n]*\\z");
  static final RuntimeInstance VELOCITY = new RuntimeInstance();
  static int checks;

  record Macro(String name, String content) {}

  static void check(boolean condition, String label) {
    if (!condition) throw new AssertionError(label);
    checks++;
  }

  static String body(String source, String label) {
    Matcher envelope = VELOCITY_ENVELOPE.matcher(source.replace("\r\n", "\n"));
    if (!envelope.matches()) throw new IllegalArgumentException(label + " : enveloppe Velocity incomplète");
    return envelope.group(1);
  }

  static List<Macro> macros(String source) throws Exception {
    List<Macro> result = new ArrayList<>();
    IWemListener listener = (IWemListener) Proxy.newProxyInstance(
        IWemListener.class.getClassLoader(), new Class<?>[] {IWemListener.class},
        (proxy, method, arguments) -> {
          if (method.getName().equals("onMacroBlock") || method.getName().equals("onMacroInline")) {
            result.add(new Macro((String) arguments[0], (String) arguments[2]));
          }
          return null;
        });
    new XWikiParser().parse(new StringReader(source), listener);
    return result;
  }

  /** Les signatures diffèrent entre Velocity 1.7 et 2.x ; aucun rendu n'est exécuté. */
  static void parseVelocity(String content, String label) throws Exception {
    Method parser;
    Object template;
    try {
      parser = RuntimeInstance.class.getMethod("parse", java.io.Reader.class, String.class);
      template = label;
    } catch (NoSuchMethodException versionTwo) {
      parser = RuntimeInstance.class.getMethod("parse", java.io.Reader.class, Template.class);
      Template value = new Template();
      value.setName(label);
      value.setRuntimeServices(VELOCITY);
      template = value;
    }
    try {
      parser.invoke(VELOCITY, new StringReader(content), template);
    } catch (InvocationTargetException invocation) {
      if (invocation.getCause() instanceof Exception cause) throw cause;
      throw invocation;
    }
  }

  static String verifyPage(Path path) throws Exception {
    String source = Files.readString(path);
    String expectedBody = body(source, path.toString());
    check(!expectedBody.isEmpty(), path + " : enveloppe complète");
    List<Macro> extracted = macros(source);
    check(extracted.size() == 1 && extracted.get(0).name().equals("velocity"),
        path + " : une seule macro Velocity extraite par XWiki");
    String actualBody = extracted.get(0).content();
    check(actualBody.replace("\r\n", "\n").equals(expectedBody),
        path + " : contenu complet transmis à Velocity, HTML inclus");
    parseVelocity(actualBody, path.toString());
    check(true, path + " : syntaxe Velocity valide");
    return source;
  }

  public static void main(String[] args) throws Exception {
    VELOCITY.setProperty("runtime.log.logsystem.class", "org.apache.velocity.runtime.log.NullLogChute");
    VELOCITY.init();
    String main = verifyPage(ROOT.resolve("WebHome.xwiki"));
    verifyPage(ROOT.resolve("DATA/WebHome.xwiki"));

    // XWiki peut aussi parser ces extensions avec Velocity (option parse=true).
    for (String extension : List.of("GlossaireExtension.js", "GlossairePageExtension.js", "GlossaireExtension.css")) {
      Path path = ROOT.resolve("CODE").resolve(extension);
      parseVelocity(Files.readString(path), path.toString());
      check(true, path + " : extension compatible avec le parseur Velocity");
    }

    String validBody = body(main, "page principale");
    Matcher closingDirective = Pattern.compile("(?m)^[ \\t]*#end[ \\t]*$").matcher(validBody);
    int start = -1, end = -1;
    while (closingDirective.find()) { start = closingDirective.start(); end = closingDirective.end(); }
    if (start < 0) throw new AssertionError("Le contrôle négatif nécessite un bloc Velocity");
    boolean missingEndRejected = false;
    try {
      parseVelocity(validBody.substring(0, start) + validBody.substring(end), "contrôle négatif : #end manquant");
    } catch (ParseException expected) {
      missingEndRejected = true;
    }
    check(missingEndRejected, "un #end manquant déclenche une erreur de syntaxe");

    boolean missingEnvelopeRejected = false;
    try {
      body(main.substring(0, main.lastIndexOf("{{/velocity}}")), "contrôle négatif : enveloppe tronquée");
    } catch (IllegalArgumentException expected) {
      missingEnvelopeRejected = true;
    }
    check(missingEnvelopeRejected, "une copie sans fermeture de macro est rejetée");
    System.out.println(checks + " vérifications des parseurs XWiki / Velocity réussies.");
  }
}
