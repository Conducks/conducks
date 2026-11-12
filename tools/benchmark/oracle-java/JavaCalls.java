// Conducks — Java call-edge oracle helper (see ../oracle-java-calls.mjs).
//
// Run as a single-file program: `java JavaCalls.java <root>`. JDK only. Parses and attributes every
// .java file under <root>, then prints every call javac RESOLVES from one project declaration to
// another: a method invocation, a constructor call (`new X(…)`, `this(…)`, `super(…)`), and a method
// reference (`X::m`). Library targets are dropped — the question is about edges inside the project.
//
// Each end is spelled the way conducks spells a node id below the file: the chain of NAMED enclosing
// declarations, lower-cased, joined by '.' — `workflow.step.go`. An anonymous class is not named, so a
// method inside one is spelled under the method that holds it (`workflow.anonymous.go`), which is how
// the parser scopes it. A call from a field initializer or an initializer block belongs to the class.
// A constructor is `<class>.<class>`.
//
// No dependency classpath (offline): calls through an unresolved library type are not resolved and so
// are not counted — they are not edges between project declarations anyway.
import com.sun.source.tree.*;
import com.sun.source.util.*;
import javax.lang.model.element.*;
import javax.tools.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;

public class JavaCalls {
  public static void main(String[] args) throws Exception {
    Path root = Paths.get(args[0]).toAbsolutePath().normalize();
    List<java.io.File> files;
    try (Stream<Path> s = Files.walk(root)) {
      files = s.filter(p -> p.toString().endsWith(".java"))
               .filter(p -> !p.getFileName().toString().equals("module-info.java"))
               .filter(p -> { String r = root.relativize(p).toString().replace('\\', '/');
                              return !r.startsWith("target/") && !r.startsWith("build/") && !r.contains("/.") && !r.startsWith("."); })
               .map(Path::toFile).collect(Collectors.toList());
    }
    JavaCompiler jc = ToolProvider.getSystemJavaCompiler();
    DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
    StandardJavaFileManager fm = jc.getStandardFileManager(diags, null, StandardCharsets.UTF_8);
    Path out = Files.createTempDirectory("conducks-javacalls");
    out.toFile().deleteOnExit();
    JavacTask task = (JavacTask) jc.getTask(null, fm, diags,
        List.of("-proc:none", "-Xlint:none", "-Xmaxerrs", "1000000", "-implicit:none", "-d", out.toString()), null, fm.getJavaFileObjectsFromFiles(files));
    List<CompilationUnitTree> units = new ArrayList<>();
    task.parse().forEach(units::add);
    task.analyze();
    Trees trees = Trees.instance(task);
    javax.lang.model.util.Elements elements = task.getElements();

    // Which file declares each project element: only those are edge ends.
    Map<Element, String> fileOf = new HashMap<>();
    for (CompilationUnitTree cu : units) {
      String rel = root.relativize(Paths.get(cu.getSourceFile().toUri())).toString().replace('\\', '/');
      new TreePathScanner<Void, Void>() {
        void mark() { Element e = trees.getElement(getCurrentPath()); if (e != null) fileOf.put(e, rel); }
        @Override public Void visitClass(ClassTree t, Void v) { mark(); return super.visitClass(t, v); }
        @Override public Void visitMethod(MethodTree t, Void v) { mark(); return super.visitMethod(t, v); }
      }.scan(cu, null);
    }

    // Which project method overrides which: a call javac binds to `Shape.area` runs `Circle.area` when
    // the receiver is a Circle, so an edge to an override of the declared target is DISPATCH, not wrong.
    StringBuilder ov = new StringBuilder("[");
    for (Element e : fileOf.keySet()) {
      if (!(e instanceof ExecutableElement m) || e.getKind() != ElementKind.METHOD) continue;
      TypeElement owner = (TypeElement) e.getEnclosingElement();
      for (Element other : fileOf.keySet()) {
        if (other == e || !(other instanceof ExecutableElement om) || other.getKind() != ElementKind.METHOD) continue;
        if (!om.getSimpleName().equals(m.getSimpleName())) continue;
        if (elements.overrides(m, om, owner)) {
          if (ov.length() > 1) ov.append(',');
          ov.append("{\"method\":").append(q(fileOf.get(e) + "::" + chain(e))).append(",\"overrides\":").append(q(fileOf.get(other) + "::" + chain(other))).append('}');
        }
      }
    }
    ov.append(']');

    StringBuilder sb = new StringBuilder("{\"edges\":[");
    boolean[] first = { true };
    long[] dropped = { 0 };
    for (CompilationUnitTree cu : units) {
      String rel = root.relativize(Paths.get(cu.getSourceFile().toUri())).toString().replace('\\', '/');
      LineMap lm = cu.getLineMap();
      new TreePathScanner<Void, Void>() {
        void edge(Tree t, String kind) {
          Element target = trees.getElement(getCurrentPath());
          if (target == null) return;
          if (!(target instanceof ExecutableElement)) return;
          // `new Step() { … }` constructs an ANONYMOUS subclass; what the source names is Step.
          if (target.getKind() == ElementKind.CONSTRUCTOR && target.getEnclosingElement().getSimpleName().toString().isEmpty()) {
            TypeElement anon = (TypeElement) target.getEnclosingElement();
            List<? extends javax.lang.model.type.TypeMirror> sup = new ArrayList<>(anon.getInterfaces());
            if (anon.getSuperclass() instanceof javax.lang.model.type.DeclaredType d && !d.toString().equals("java.lang.Object")) sup = List.of(d);
            if (sup.isEmpty() || !(sup.get(0) instanceof javax.lang.model.type.DeclaredType dt)) return;
            Element named = dt.asElement();
            if (!fileOf.containsKey(named)) return;
            if (!first[0]) sb.append(','); first[0] = false;
            Element from0 = enclosing(getCurrentPath());
            if (from0 == null || fileOf.get(from0) == null) return;
            sb.append("{\"fromFile\":").append(q(rel)).append(",\"from\":").append(q(chain(from0)))
              .append(",\"toFile\":").append(q(fileOf.get(named))).append(",\"to\":").append(q(chain(named)))
              .append(",\"toClass\":").append(q(chain(named))).append(",\"name\":").append(q(named.getSimpleName().toString()))
              .append(",\"kind\":\"new\",\"line\":").append(lm.getLineNumber(trees.getSourcePositions().getStartPosition(cu, t))).append('}');
            return;
          }
          String toFile = fileOf.get(target.getKind() == ElementKind.CONSTRUCTOR ? target : target);
          if (toFile == null) toFile = fileOf.get(target.getEnclosingElement());
          if (toFile == null || !fileOf.containsKey(target.getEnclosingElement())) return;   // a library target
          // Written by the COMPILER, not in the source: an implicit `super()`, a default constructor.
          if (trees.getSourcePositions().getStartPosition(cu, t) < 0) return;
          Element from = enclosing(getCurrentPath());
          if (from == null) { dropped[0]++; return; }
          if (fileOf.get(from) == null || elements.getOrigin(from) != javax.lang.model.util.Elements.Origin.EXPLICIT) return;   // a default constructor
          // An enum constant constructs its own enum: `RED` is `new Color()` only to the compiler.
          if (kind.equals("new") && from.getKind() == ElementKind.ENUM && from.equals(target.getEnclosingElement())) return;
          if (from.equals(target)) return;                // recursion: conducks draws no self-edge
          if (!first[0]) sb.append(','); first[0] = false;
          sb.append("{\"fromFile\":").append(q(rel)).append(",\"from\":").append(q(chain(from)))
            .append(",\"toFile\":").append(q(toFile)).append(",\"to\":").append(q(chain(target)))
            .append(",\"toClass\":").append(q(chain(target.getEnclosingElement())))
            .append(",\"name\":").append(q(target.getKind() == ElementKind.CONSTRUCTOR ? target.getEnclosingElement().getSimpleName().toString() : target.getSimpleName().toString()))
            .append(",\"kind\":").append(q(kind))
            .append(",\"line\":").append(lm.getLineNumber(trees.getSourcePositions().getStartPosition(cu, t))).append('}');
        }
        /** The nearest enclosing NAMED method or class — the declaration conducks attributes a call to. */
        Element enclosing(TreePath p) {
          for (TreePath cur = p.getParentPath(); cur != null; cur = cur.getParentPath()) {
            Tree leaf = cur.getLeaf();
            if (leaf instanceof MethodTree || (leaf instanceof ClassTree c && !c.getSimpleName().toString().isEmpty())) {
              return trees.getElement(cur);
            }
          }
          return null;
        }
        @Override public Void visitMethodInvocation(MethodInvocationTree t, Void v) { edge(t, "call"); return super.visitMethodInvocation(t, v); }
        @Override public Void visitNewClass(NewClassTree t, Void v) { edge(t, "new"); return super.visitNewClass(t, v); }
        @Override public Void visitMemberReference(MemberReferenceTree t, Void v) { edge(t, "ref"); return super.visitMemberReference(t, v); }
      }.scan(cu, null);
    }
    long errors = diags.getDiagnostics().stream().filter(d -> d.getKind() == Diagnostic.Kind.ERROR).count();
    sb.append("],\"overrides\":").append(ov).append(",\"files\":").append(units.size()).append(",\"errors\":").append(errors).append(",\"unattributed\":").append(dropped[0]).append('}');
    System.out.println(sb);
  }

  /** `outer.inner.method`, lower-cased; anonymous classes skipped; a constructor is `<class>.<class>`. */
  static String chain(Element e) {
    Deque<String> parts = new ArrayDeque<>();
    for (Element x = e; x != null && x.getKind() != ElementKind.PACKAGE && x.getKind() != ElementKind.MODULE; x = x.getEnclosingElement()) {
      String n = x.getKind() == ElementKind.CONSTRUCTOR ? x.getEnclosingElement().getSimpleName().toString() : x.getSimpleName().toString();
      if (n.isEmpty()) continue;          // anonymous class
      parts.addFirst(n.toLowerCase(Locale.ROOT));
    }
    return String.join(".", parts);
  }

  static String q(String s) {
    if (s == null) return "null";
    StringBuilder b = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      switch (c) {
        case '"' -> b.append("\\\""); case '\\' -> b.append("\\\\"); case '\n' -> b.append("\\n");
        default -> { if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); }
      }
    }
    return b.append('"').toString();
  }
}
