import java.io.StringReader;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.apache.velocity.Template;
import org.apache.velocity.runtime.RuntimeInstance;
import org.apache.velocity.runtime.parser.ParseException;
import org.xwiki.rendering.wikimodel.IWemListener;
import org.xwiki.rendering.wikimodel.xwiki.xwiki21.XWikiParser;

/** Real XWiki 2.1 and Velocity parsers; no server APIs are simulated or executed.
 * Run: java -cp '/path/to/velocity-and-wikimodel-jars/*' tests/DocumentationXWikiParsingTest.java
 */
public class DocumentationXWikiParsingTest {
  static final Path ROOT = Path.of("xwiki/TestPage/PAGE/doc-test");
  static final RuntimeInstance VELOCITY = new RuntimeInstance();
  record Macro(String name, String source) {}
  static List<Macro> macros(String source) throws Exception {
    List<Macro> result = new ArrayList<>();
    IWemListener listener = (IWemListener) Proxy.newProxyInstance(IWemListener.class.getClassLoader(),
        new Class<?>[] {IWemListener.class}, (proxy, method, args) -> {
          if (method.getName().equals("onMacroBlock") || method.getName().equals("onMacroInline"))
            result.add(new Macro((String)args[0], (String)args[2]));
          return null;
        });
    new XWikiParser().parse(new StringReader(source), listener);
    return result;
  }
  static void parse(String source, String label) throws Exception {
    Method method;
    Object template;
    try { method = RuntimeInstance.class.getMethod("parse", java.io.Reader.class, String.class); template = label; }
    catch (NoSuchMethodException velocity2) {
      method = RuntimeInstance.class.getMethod("parse", java.io.Reader.class, Template.class);
      Template t = new Template(); t.setName(label); t.setRuntimeServices(VELOCITY); template = t;
    }
    try { method.invoke(VELOCITY, new StringReader(source), template); }
    catch (InvocationTargetException wrapped) {
      if (wrapped.getCause() instanceof Exception cause) throw cause;
      throw wrapped;
    }
  }
  public static void main(String[] args) throws Exception {
    VELOCITY.init();
    int count = 0;
    for (String name : List.of("WebHome.xwiki", "COMMANDE.xwiki", "CODE/Permissions.xwiki", "CODE/DocumentContent.xwiki")) {
      String source = Files.readString(ROOT.resolve(name));
      List<Macro> values = macros(source);
      long expected = name.equals("COMMANDE.xwiki") ? 2 : 1;
      if (values.stream().filter(value -> value.name().equals("velocity")).count() != expected)
        throw new AssertionError(name + ": incomplete Velocity envelope or unexpected macro");
      for (Macro value : values) if (value.name().equals("velocity")) parse(value.source(), name);
      count++; System.out.println("PASS: XWiki and Velocity parse " + name);
    }
    boolean rejected = false;
    try { parse("#if(true)unclosed", "missing end negative control"); }
    catch (ParseException expected) { rejected = true; }
    if (!rejected) throw new AssertionError("Parser must reject an unclosed directive");
    System.out.println(count + " XWiki pages parsed, with missing-#end negative control.");
  }
}
