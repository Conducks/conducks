package com.acme;

import com.acme.model.*;
import com.acme.shapes.Circle;
import com.acme.shapes.Shape;
import com.acme.util.Strings;
import java.util.List;

import static com.acme.util.Maths.square;

public class App {
    public static void main(String[] args) {
        Service service = new Service();          // same package: no import
        service.run();
        Owner owner = new Owner("ann");           // wildcard import
        Point p = new Point(1, 2);                // record
        Color c = Color.RED;                      // enum constant
        Shape s = new Circle(2.0);                // interface dispatch
        double a = s.area();
        int sq = square(3);                       // static import
        List<String> up = List.of("a").stream().map(Strings::upper).toList();   // method reference
        String t = Strings.trimAll(" x ");
        Outer.Inner.ping();                       // static nested class
        Registry.register(Plugin.class);          // class literal only
        Runnable r = () -> service.run();
        r.run();
        Base b = new Derived();
        System.out.println(owner.getName() + p.x() + c + a + sq + up + t + b.template());
    }
}
