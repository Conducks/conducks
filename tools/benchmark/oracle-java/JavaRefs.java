// Conducks — Java reference oracle helper (see ../oracle-java-dead.mjs).
//
// Run as a single-file program: `java JavaRefs.java <root>`. JDK only (javax.tools + com.sun.source).
// Parses and attributes every .java file under <root> (main and test sources together, so a symbol
// only a test uses is referenced), then prints JSON: every class, method and field declared in a
// non-generated source file, with the number of references javac resolved to it.
//
// A reference is any tree javac resolves to the declaration's element — a call, `new X()`, `X.class`,
// a method reference, a type in a declaration, `extends`/`implements` — that lies OUTSIDE the
// declaration's own span (a recursive call is not a caller). A constructor reference counts for its
// class.
//
// Runs with no dependency classpath on purpose (offline). Unresolved library types become error
// types; references between the project's own declarations still resolve, which is what EXTRA needs.
// The error count is reported so the reader knows how much of the program was attributed.
import com.sun.source.tree.*;
import com.sun.source.util.*;
import javax.lang.model.element.*;
import javax.lang.model.type.*;
import javax.lang.model.util.*;
import javax.tools.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.*;

public class JavaRefs {
  static final Set<String> COMPILER_ANNOTATIONS = Set.of("java.lang.Override", "java.lang.SuppressWarnings",
      "java.lang.Deprecated", "java.lang.FunctionalInterface", "java.lang.SafeVarargs");
  static final class Def {
    String file, name, kind, owner; int line; long start, end;
    boolean test, annotated, main, accessor, isPublic, enumConstant, topLevel, api;
    String override;      // "abstract:<owner>.<name>" (compile-required) | "concrete:<…>" | "unresolved"
    int refs, refsOtherFile, refsNonTest, importRefs, memberRefs; String firstMemberRef; String firstRef;
  }

  public static void main(String[] args) throws Exception {
    Path root = Paths.get(args[0]).toAbsolutePath().normalize();
    List<File> files;
    try (Stream<Path> s = Files.walk(root)) {
      files = s.filter(p -> p.toString().endsWith(".java"))
               // module-info.java: a multi-module tree has several, and javac compiles ONE module per run
               // — measured on gson: "too many module declarations found", the first of 100 errors.
               .filter(p -> !p.getFileName().toString().equals("module-info.java"))
               .filter(p -> { String r = root.relativize(p).toString().replace('\\', '/');
                              return !r.startsWith("target/") && !r.startsWith("build/") && !r.contains("/.") && !r.startsWith("."); })
               .map(Path::toFile).collect(Collectors.toList());
    }
    JavaCompiler jc = ToolProvider.getSystemJavaCompiler();
    DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
    StandardJavaFileManager fm = jc.getStandardFileManager(diags, null, StandardCharsets.UTF_8);
    Path out = Files.createTempDirectory("conducks-javarefs");
    out.toFile().deleteOnExit();   // nothing is generated (analyze only), but the dir was left behind on every run
    JavacTask task = (JavacTask) jc.getTask(null, fm, diags,
        List.of("-proc:none", "-Xlint:none", "-Xmaxerrs", "1000000", "-implicit:none", "-d", out.toString()), null, fm.getJavaFileObjectsFromFiles(files));
    List<CompilationUnitTree> units = new ArrayList<>();
    task.parse().forEach(units::add);
    task.analyze();
    Trees trees = Trees.instance(task);
    Elements elements = task.getElements();
    Types types = task.getTypes();
    SourcePositions pos = trees.getSourcePositions();

    Map<Element, Def> defs = new HashMap<>();
    for (CompilationUnitTree cu : units) {
      String rel = root.relativize(Paths.get(cu.getSourceFile().toUri())).toString().replace('\\', '/');
      boolean test = rel.contains("/test/") || rel.startsWith("test/");
      LineMap lm = cu.getLineMap();
      new TreePathScanner<Void, Void>() {
        void add(Tree t, String kind, String name, String owner) {
          Element e = trees.getElement(getCurrentPath());
          if (e == null) return;
          Def d = new Def();
          d.file = rel; d.kind = kind; d.name = name; d.owner = owner; d.test = test;
          d.start = pos.getStartPosition(cu, t); d.end = pos.getEndPosition(cu, t);
          d.line = (int) lm.getLineNumber(d.start);
          // Framework-managed: an annotation other than the compiler's own (@Override is a check, not a hook).
          d.annotated = e.getAnnotationMirrors().stream().map(m -> m.getAnnotationType().toString())
              .anyMatch(n -> !COMPILER_ANNOTATIONS.contains(n));
          d.enumConstant = e.getKind() == ElementKind.ENUM_CONSTANT;
          d.isPublic = e.getModifiers().contains(Modifier.PUBLIC);
          d.topLevel = e.getEnclosingElement() != null && e.getEnclosingElement().getKind() == ElementKind.PACKAGE;
          // API: reachable from outside the project — public/protected all the way up to the package.
          d.api = true;
          for (Element x = e; x != null && x.getKind() != ElementKind.PACKAGE; x = x.getEnclosingElement()) {
            Set<Modifier> m = x.getModifiers();
            boolean iface = x.getEnclosingElement() instanceof TypeElement te && te.getKind().isInterface();
            if (!(m.contains(Modifier.PUBLIC) || m.contains(Modifier.PROTECTED) || iface)) { d.api = false; break; }
          }
          defs.put(e, d);
        }
        @Override public Void visitClass(ClassTree t, Void v) {
          Element e = trees.getElement(getCurrentPath());
          String owner = e != null && e.getEnclosingElement() instanceof TypeElement te ? te.getSimpleName().toString() : "";
          // An anonymous class — `new X() {…}`, an enum constant's body — declares nothing anyone can
          // name or reference. Measured on gson: scored as 20 unreferenced TOP-LEVEL types (owner "").
          if (!t.getSimpleName().toString().isEmpty()) add(t, "class", t.getSimpleName().toString(), owner);
          return super.visitClass(t, v);
        }
        @Override public Void visitMethod(MethodTree t, Void v) {
          Element e = trees.getElement(getCurrentPath());
          if (e instanceof ExecutableElement ee && ee.getKind() == ElementKind.METHOD) {
            TypeElement owner = (TypeElement) ee.getEnclosingElement();
            add(t, "method", t.getName().toString(), owner.getSimpleName().toString());
            Def d = defs.get(e);
            if (d != null) {
              String n = d.name;
              d.main = n.equals("main") && ee.getModifiers().contains(Modifier.STATIC) && ee.getParameters().size() == 1;
              d.accessor = (n.matches("(get|is)[A-Z].*") && ee.getParameters().isEmpty())
                        || (n.matches("set[A-Z].*") && ee.getParameters().size() == 1);
              d.override = overrideOf(ee, owner, elements, types);
              if (d.override == null && ee.getAnnotationMirrors().stream().anyMatch(a -> a.getAnnotationType().toString().endsWith("Override")))
                d.override = "unresolved";
            }
          }
          return super.visitMethod(t, v);
        }
        @Override public Void visitVariable(VariableTree t, Void v) {
          Element e = trees.getElement(getCurrentPath());
          if (e != null && (e.getKind() == ElementKind.FIELD || e.getKind() == ElementKind.ENUM_CONSTANT)) {
            add(t, "field", t.getName().toString(), ((TypeElement) e.getEnclosingElement()).getSimpleName().toString());
          }
          return super.visitVariable(t, v);
        }
      }.scan(cu, null);
    }

    for (CompilationUnitTree cu : units) {
      String rel = root.relativize(Paths.get(cu.getSourceFile().toUri())).toString().replace('\\', '/');
      boolean fromTest = rel.contains("/test/") || rel.startsWith("test/");
      LineMap lm = cu.getLineMap();
      new TreePathScanner<Void, Void>() {
        void ref(Tree t) {
          Element e = trees.getElement(getCurrentPath());
          if (e == null) return;
          if (e.getKind() == ElementKind.CONSTRUCTOR) e = e.getEnclosingElement();
          Def d = defs.get(e);
          if (d == null) return;
          long at = pos.getStartPosition(cu, t);
          if (d.file.equals(rel) && at >= d.start && at < d.end) return;   // inside its own declaration
          d.refs++;
          if (inImport) d.importRefs++;
          if (!d.file.equals(rel)) d.refsOtherFile++;
          if (!fromTest) d.refsNonTest++;
          if (d.firstRef == null) d.firstRef = rel + ":" + lm.getLineNumber(at);
          // A type whose MEMBERS are referenced from OUTSIDE it is in use: `square(3)` resolves to
          // Maths.square, and deleting Maths breaks the build all the same. Propagated to every
          // enclosing type, but only for a reference outside THAT type — a class using its own nested
          // classes is not used (measured on gson: NoSerializedNameMain read as live through itself).
          if (inImport) return;
          for (Element up = e.getEnclosingElement(); up != null; up = up.getEnclosingElement()) {
            Def holder = defs.get(up);
            if (holder == null) continue;
            if (holder.file.equals(rel) && at >= holder.start && at < holder.end) break;
            holder.memberRefs++;
            if (holder.firstMemberRef == null) holder.firstMemberRef = d.owner + "." + d.name + " at " + rel + ":" + lm.getLineNumber(at);
          }
        }
        boolean inImport = false;
        @Override public Void visitImport(ImportTree t, Void v) { inImport = true; try { return super.visitImport(t, v); } finally { inImport = false; } }
        @Override public Void visitIdentifier(IdentifierTree t, Void v) { ref(t); return super.visitIdentifier(t, v); }
        @Override public Void visitMemberSelect(MemberSelectTree t, Void v) { ref(t); return super.visitMemberSelect(t, v); }
        @Override public Void visitMemberReference(MemberReferenceTree t, Void v) { ref(t); return super.visitMemberReference(t, v); }
        @Override public Void visitNewClass(NewClassTree t, Void v) { ref(t); return super.visitNewClass(t, v); }
      }.scan(cu, null);
    }

    // A class that holds `main` is an entry point as much as `main` is.
    for (Map.Entry<Element, Def> en : defs.entrySet()) {
      if (en.getValue().main) { Def holder = defs.get(en.getKey().getEnclosingElement()); if (holder != null) holder.main = true; }
    }
    long errors = diags.getDiagnostics().stream().filter(d -> d.getKind() == Diagnostic.Kind.ERROR).count();
    String firstError = diags.getDiagnostics().stream().filter(d -> d.getKind() == Diagnostic.Kind.ERROR)
        .map(d -> d.getMessage(Locale.ROOT)).findFirst().orElse("");
    StringBuilder sb = new StringBuilder();
    sb.append("{\"files\":").append(units.size()).append(",\"errors\":").append(errors)
      .append(",\"firstError\":").append(q(firstError)).append(",\"defs\":[");
    boolean first = true;
    for (Def d : defs.values()) {
      if (!first) sb.append(','); first = false;
      sb.append('{').append("\"file\":").append(q(d.file)).append(",\"line\":").append(d.line)
        .append(",\"name\":").append(q(d.name)).append(",\"kind\":").append(q(d.kind)).append(",\"owner\":").append(q(d.owner))
        .append(",\"test\":").append(d.test).append(",\"annotated\":").append(d.annotated).append(",\"main\":").append(d.main)
        .append(",\"accessor\":").append(d.accessor).append(",\"enumConstant\":").append(d.enumConstant).append(",\"isPublic\":").append(d.isPublic).append(",\"topLevel\":").append(d.topLevel).append(",\"api\":").append(d.api)
        .append(",\"override\":").append(q(d.override)).append(",\"refs\":").append(d.refs)
        .append(",\"importRefs\":").append(d.importRefs).append(",\"memberRefs\":").append(d.memberRefs).append(",\"firstMemberRef\":").append(q(d.firstMemberRef)).append(",\"refsOtherFile\":").append(d.refsOtherFile).append(",\"refsNonTest\":").append(d.refsNonTest)
        .append(",\"firstRef\":").append(q(d.firstRef)).append('}');
    }
    sb.append("]}");
    System.out.println(sb);
  }

  /** What `m` overrides: "abstract:…" when deleting m would break the build, "concrete:…" otherwise. */
  static String overrideOf(ExecutableElement m, TypeElement owner, Elements elements, Types types) {
    Deque<TypeMirror> todo = new ArrayDeque<>(types.directSupertypes(owner.asType()));
    Set<String> seen = new HashSet<>();
    String concrete = null;
    while (!todo.isEmpty()) {
      TypeMirror t = todo.pop();
      if (t.getKind() != TypeKind.DECLARED || !seen.add(t.toString())) continue;
      TypeElement te = (TypeElement) ((DeclaredType) t).asElement();
      for (Element e : te.getEnclosedElements()) {
        if (e instanceof ExecutableElement other && e.getKind() == ElementKind.METHOD && elements.overrides(m, other, owner)) {
          String id = te.getSimpleName() + "." + other.getSimpleName();
          if (other.getModifiers().contains(Modifier.ABSTRACT)) return "abstract:" + id;
          if (concrete == null) concrete = "concrete:" + id;
        }
      }
      todo.addAll(types.directSupertypes(t));
    }
    return concrete;
  }

  static String q(String s) {
    if (s == null) return "null";
    StringBuilder b = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      switch (c) {
        case '"' -> b.append("\\\""); case '\\' -> b.append("\\\\"); case '\n' -> b.append("\\n"); case '\r' -> b.append("\\r"); case '\t' -> b.append("\\t");
        default -> { if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); }
      }
    }
    return b.append('"').toString();
  }
}
