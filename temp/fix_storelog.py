from pathlib import Path

commands_folder = Path('../tests/unit/interfaces/cli/commands')
pattern = "const storeLog = (inputs: string) => (output += inputs + '\\n');"

for p in sorted(commands_folder.glob('*.test.ts')):
    lines = p.read_text(encoding='utf-8').splitlines()
    new_lines = []
    i = 0
    changed = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith("const storeLog = (inputs: string) => (output += inputs +"):
            # Replace malformed variants with normalized expression
            new_lines.append("  " + pattern)
            changed = True
            # skip next line if it is closing quote/shr
            if i + 1 < len(lines) and lines[i + 1].strip() in ["');", "\\n');", "']);"]:
                i += 2
                continue
            i += 1
            continue

        # Also catch empty lines where previous line ended with plus and newline exists
        if stripped == "');" and i > 0 and lines[i - 1].strip().startswith("const storeLog"):
            # already fixed above, skip
            i += 1
            continue

        new_lines.append(line)
        i += 1

    if changed:
        p.write_text('\n'.join(new_lines) + '\n', encoding='utf-8')
        print('patched', p.name)

print('done')
