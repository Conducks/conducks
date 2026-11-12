package com.acme.generic;

public class StringAdapter extends Adapter<String> implements Codec<String> {
    public String read() { return "s"; }
}
