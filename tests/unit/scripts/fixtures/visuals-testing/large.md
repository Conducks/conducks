# Testing — ForgeTerm
Provenance: authored — manual test tasks, ported from ForgeTerm's `docs/visuals/testing.html` `DATA` array (ADR 0154, todo74#P1). Every task is something a human tries; nothing here is a code claim, so no anchor applies.

## The window
chrome that has to earn its pixels

### F1 — The bar across the top
- How: One row, full window width. Traffic lights at its left. The strip and the panes start below it.
- Note: F1.T3 from your last pass is what T5–T7 are. macOS hides the traffic lights in fullscreen and brings them back in an overlay drawn OVER our surface, so our bar could not hover with them, it gives up its row instead and the strip takes the controls.
- [ ] F1.T1 The row runs edge to edge, not just across the tab strip.
- [ ] F1.T2 Nothing is drawn under the traffic lights, and nothing under the bar.
- [ ] F1.T3 Resize the window, the bar keeps its height and everything stays below it.
- [ ] F1.T4 No "ForgeTerm" wordmark anywhere in the window.
- [ ] F1.T5 <strong>Go fullscreen.</strong> The bar disappears entirely, no empty 28-point row where the traffic lights used to be.
- [ ] F1.T6 In fullscreen the strip grows a header of its own, and the controls are in it.
- [ ] F1.T7 Leave fullscreen with the green button or a swipe, the bar comes back and the strip's header goes away, with no keystroke of yours.

### F2 — The strip's controls
- How: A sidebar icon, a <code>+</code> and a folder, in the top bar, or in the strip's own header when fullscreen.
- [ ] F2.T1 You can see it <em>without</em> hovering over it.
- [ ] F2.T2 Clicking it collapses the strip to a thin sliver.
- [ ] F2.T3 Clicking it again reopens the strip at the width you had.
- [ ] F2.T4 Clicking the sliver itself also reopens it.
- [ ] F2.T5 Do all of the above again with the strip <strong>already collapsed</strong>, that is where it failed hardest before.
- [ ] F2.T6 The icon is a <strong>sidebar</strong> now, not a chevron: a small rectangle with its left column filled.
- [ ] F2.T7 The filled column <strong>empties</strong> when the strip is closed and fills again when it opens, it reports the state, not the action.
- [ ] F2.T8 The <code>+</code> at the right of the row opens a new tab.
- [ ] F2.T9 The <code>+</code> sits over the strip, not out at the far right of the window.
- [ ] F2.T10 Pressing the <code>+</code> does not also close the strip.
- [ ] F2.T11 With the strip collapsed the <code>+</code> is gone, and the sidebar icon remains so there is a way back.
- [ ] F2.T12 Both controls work the same in fullscreen, from the strip's own header.
- [ ] F2.T13 In fullscreen they sit at the <strong>right</strong> end of the strip's header, out of the column the rows are read down.
- [ ] F2.T14 Neither icon has a box behind it until you point at it.
- [ ] F2.T15 The two sit side by side as a pair, not at opposite ends of the row.
- [ ] F2.T16 <strong>A third control, a folder, sits right of the <code>+</code>.</strong> Clicking it splits a file explorer into the tab, the same thing <kbd>⌃⇧E</kbd> does.
- [ ] F2.T17 All three are evenly spaced and none overlaps another, at both 1x and on a Retina display.
- [ ] F2.T18 With the strip collapsed the folder is gone along with the <code>+</code>, and only the sidebar icon remains.
- [ ] F2.T19 The folder does not close the strip when pressed.

### F3 — The macOS menu bar
- How: A real NSMenu. Every item runs the same code path as its chord.
- [ ] F3.T1 File lists Split Pane, Split Plugin Pane, Open Launch Config, Save Layout, New Tab, Close Pane.
- [ ] F3.T2 Edit lists Copy and Paste.
- [ ] F3.T3 Window lists Next Pane, Rename Tab, Next Tab, Resize Pane Wider, Resize Pane Narrower.
- [ ] F3.T4 Pick three items at random, each does the same thing as the chord shown beside it.

## Tabs
a tab is a named pane tree, there are no groups

### F4 — New tab
- How: <kbd>⌃⇧T</kbd>, or File → New Tab, or right-click the strip's empty area.
- [ ] F4.T1 The chord opens a new tab with its own shell.
- [ ] F4.T2 The menu item does the same.
- [ ] F4.T3 The new tab is named after its directory.

### F5 — Next tab
- How: <kbd>⌃⇧Tab</kbd>, or Window → Next Tab.
- [ ] F5.T1 It moves to the next tab and wraps round at the end.
- [ ] F5.T2 Each tab keeps its own focused pane when you come back to it.

### F6 — The tab strip
- How: Switch by clicking a row. Close via the hover ×. Reorder by dragging. Resize by dragging its right edge.
- [ ] F6.T1 Clicking a row switches to it.
- [ ] F6.T2 The close control appears <em>only</em> on the row you are pointing at.
- [ ] F6.T3 Dragging a row up or down reorders it, and a line shows where it will land.
- [ ] F6.T4 After a reorder the same tab is still active, it must not jump to a neighbour.
- [ ] F6.T5 The last tab refuses to close.
- [ ] F6.T6 Dragging the strip's right edge resizes it, and it stops at a minimum.
- [ ] F6.T7 A pointer moving over the terminal does not make the strip flicker.
- [ ] F6.T8 Each row shows an icon, the tab's name, and its working directory underneath in a dimmer colour.
- [ ] F6.T9 A long path keeps its <strong>end</strong> and marks the cut with a <code>…</code>, the end says which project, the start only says which machine.
- [ ] F6.T10 A tab whose shell has not reported a directory shows one centred line, not a name over an empty gap.
- [ ] F6.T11 <code>cd</code> in a split pane, the subtitle follows the <strong>focused</strong> pane's directory, not another pane's.
- [ ] F6.T12 <strong>Split a tab.</strong> Its strip row grows child rows, one per pane, indented under it.
- [ ] F6.T13 Each pane row has a colour bar, and the <strong>same colour</strong> appears on that pane's header in the window.
- [ ] F6.T14 A tab with one pane lists no children at all.
- [ ] F6.T15 A pane row is named after what is <em>running</em> in it, falling back to its directory.
- [ ] F6.T16 Click a pane row in a tab that is <strong>not</strong> active, it switches to that tab and focuses that pane.
- [ ] F6.T17 With three panes, click the third row. It must focus the third pane, not the first.
- [ ] F6.T18 A third line shows the <strong>git branch</strong>, with the uncommitted count right-aligned in amber.
- [ ] F6.T19 The count matches <code>git status --porcelain | wc -l</code> in that directory.
- [ ] F6.T20 A clean repository shows the branch and <strong>no number</strong>, not a <code>0</code>.
- [ ] F6.T21 <code>cd</code> somewhere that is not a repository, the third line disappears entirely.
- [ ] F6.T22 The branch appears a moment <em>after</em> a <code>cd</code>, not instantly. That is deliberate: git runs off the drawing thread, and a row that answered instantly would be describing the previous directory.
- [ ] F6.T23 The icon is a filled circle with a glyph in it.
- [ ] F6.T24 Run something long, <code>claude</code>, <code>cargo build</code>, <code>vim</code>, and the glyph <strong>changes</strong> while it runs, then goes back to the prompt mark.
- [ ] F6.T25 Run a program not in the table (anything unusual). The glyph must not look like an idle shell.

### F7 — A tab is named after its directory
- How: Automatic. Follows a <code>cd</code>.
- [ ] F7.T1 <code>cd</code> somewhere, the tab's name follows.
- [ ] F7.T2 A tab you renamed by hand does <strong>not</strong> get overwritten by a later <code>cd</code>.

### F8 — Rename a tab
- How: <kbd>⌃⇧R</kbd>, or Window → Rename Tab, or right-click a tab row.
- [ ] F8.T1 The field opens pre-filled with the current name.
- [ ] F8.T2 Enter commits, Escape cancels and leaves the old name.
- [ ] F8.T3 Right-click a <strong>different</strong> row and rename, it must rename that row, not the active one.

## Panes
several shells in one tab

### F9 — Split a pane
- How: <kbd>⌃⇧O</kbd>, File → Split Pane, or the pane's ⋮ menu.
- [ ] F9.T1 A second shell appears beside the first, with its own prompt.
- [ ] F9.T2 Both panes are usable, type in each.
- [ ] F9.T3 Each pane is sized to its own rectangle: run <code>seq 1 200</code> in a small pane and the output fits.
- [ ] F9.T4 <strong>Close every other pane.</strong> The survivor's shell must fill the whole pane, this was broken: only splitting refit the grid, so a pane that inherited space kept its old smaller one.
- [ ] F9.T5 Do the same in <strong>fullscreen</strong>, which is where it showed worst.
- [ ] F9.T6 Nudge a boundary with <kbd>⌃⇧←</kbd>/<kbd>⌃⇧→</kbd>, the text reflows to the new width.
- [ ] F9.T7 There is noticeably more room for text in each pane than before: the padding, gap and text inset were all cut.

### F10 — Split into a plugin pane
- How: <kbd>⌃⇧P</kbd>, or File → Split Plugin Pane.
- [ ] F10.T1 A plugin pane appears beside the focused pane.
- [ ] F10.T2 It is a plugin pane, not a second shell.

### F11 — Every pane has a header
- How: A strip across the top of each pane: its own name, a ⋮ and a ×.
- Note: Say if the accent outline on the focused pane is too loud.
- [ ] F11.T1 Split a few times and <code>cd</code> somewhere different in each, every header follows its own pane.
- [ ] F11.T2 The <strong>focused</strong> pane is outlined in the accent colour. Press <kbd>Tab</kbd> and watch it follow.
- [ ] F11.T3 Run <code>seq 1 200</code>, the last line is really the last line, not hidden under a header.
- [ ] F11.T4 Drag a pane very narrow, the buttons disappear rather than stacking on each other.
- [ ] F11.T5 With two or more panes, each header carries a coloured bar down its left, and they differ.
- [ ] F11.T6 A tab with a single pane has <strong>no</strong> colour bar, there is nothing to tell it apart from.

### F12 — Close a pane from its header
- How: The <code>×</code> at the right end of a pane's header.
- [ ] F12.T1 Split into three, focus one pane, then close a <strong>different</strong> one by its ×. The one you clicked must close.
- [ ] F12.T2 The last pane refuses to close.
- [ ] F12.T3 The neighbour takes the space back with no gap left behind.

### F13 — The pane menu, from its header
- How: The <code>⋮</code> beside the close button.
- [ ] F13.T1 It lists Split Pane, Split Plugin Pane, <strong>Zoom Pane</strong>, Close Pane, Toggle Plugin, and all four of Select All / Cut / Copy / Paste.
- [ ] F13.T2 <strong>Zoom Pane</strong> from the menu does the same as <kbd>⌃⇧Z</kbd>, and on the pane you right-clicked.
- [ ] F13.T3 <strong>Paste</strong> from the menu pastes, it used to offer Copy with no way to paste back.
- [ ] F13.T4 It opens under the button, in the same place every time.
- [ ] F13.T5 Its items match the right-click menu on the same pane.
- [ ] F13.T6 With three panes, use one pane's ⋮ to Split, the split happens in <strong>that</strong> pane, not the focused one.
- [ ] F13.T7 Close Pane is greyed out when the tab holds only one pane.
- [ ] F13.T8 Escape and clicking away both dismiss it.

### F14 — Drag a pane to move it
- How: Press a header away from its buttons, drag onto another pane, let go near its left, right, top or bottom edge.
- Note: Dropping onto the tab strip does nothing, moving a pane to another tab is not built.
- [ ] F14.T1 The landing preview follows the pointer <strong>continuously</strong>, no blinking, including across the gap between panes.
- [ ] F14.T2 Drag the bottom pane onto the top one's <strong>right</strong> edge, it ends up beside it, not below.
- [ ] F14.T3 The preview is on the same side the pane actually lands.
- [ ] F14.T4 Moving sideways from the centre lights up left/right <strong>sooner</strong> than up/down lights up above/below.
- [ ] F14.T5 The dead centre of a pane shows no preview, and letting go there changes nothing.
- [ ] F14.T6 Dropping a pane on itself does nothing.
- [ ] F14.T7 A terminal dragged next to a plugin is still a terminal, with its shell and scrollback intact.

### F15 — Pressing a header does not reach the terminal
- How: A press on a header's empty space.
- [ ] F15.T1 Press and drag along a header, no text gets selected in the terminal below.
- [ ] F15.T2 It still focuses the pane you pressed.
- [ ] F15.T3 Same on a plugin pane: the plugin must not receive a click.

### F16 — Close a pane by chord
- How: <kbd>⌃⇧W</kbd>, or File → Close Pane.
- [ ] F16.T1 It closes the focused pane and its shell exits.
- [ ] F16.T2 The last pane refuses to close.

### F17 — Toggle a plugin
- How: <kbd>⌃⇧D</kbd>, or View → Toggle Plugin, with a plugin pane focused.
- [ ] F17.T1 It disables the plugin. The pane stays and shows nothing.
- [ ] F17.T2 Pressing again brings it back.

### F18 — Resize panes
- How: <kbd>⌃⇧→</kbd> and <kbd>⌃⇧←</kbd>, or drag the boundary between two panes.
- Note: This used to say the nested boundary was a known gap. It was fixed in todo10 Phase 4 and the note was never updated, a page that says something is broken when it works costs a tester the same as one that hides a break. When a boundary has splits on BOTH sides no leaf can name it, so the hit carries a path from the root instead of a pane.
- [ ] F18.T1 The chords grow and shrink the focused pane, and stop before either pane vanishes.
- [ ] F18.T2 Dragging the boundary with the mouse moves it, and the pane's text reflows to match.
- [ ] F18.T3 Split on <em>both</em> sides of an earlier split, then drag that MIDDLE boundary. It moves the split it belongs to, and the panes either side reflow.
- [ ] F18.T4 Do the same two levels deep and drag the outermost boundary: it still moves the right one.

### F19 — Move focus between panes
- How: <kbd>Tab</kbd> with no completion list open.
- [ ] F19.T1 Focus moves through every pane in turn, not just two.
- [ ] F19.T2 The focused pane's outline and cursor follow.

## The terminal itself
the things that were broken last pass

### F20 — Select text and copy it
- How: Press and drag over the text. <kbd>⌘C</kbd> to copy.
- Note: This is the one that was measured from the wrong origin. Press precisely on a character.
- [ ] F20.T1 Drag across some text, <strong>a highlight appears</strong>. This never existed: the selection was tracked and copyable but nothing was drawn, so it looked broken.
- [ ] F20.T2 Selection starts on the character <strong>under the pointer</strong>, press exactly on a letter and check the highlight starts there, not several columns to the right.
- [ ] F20.T3 The text under the highlight is still readable.
- [ ] F20.T4 Select across several lines: the first line runs to its end, the middle lines are whole, the last stops where you let go.
- [ ] F20.T5 <kbd>⌘A</kbd> selects the whole buffer, scrollback included, scroll up and check the highlight is there too.
- [ ] F20.T6 Edit → Select All does the same as the chord.
- [ ] F20.T7 Scroll while text is selected, the highlight stays on the same text, not the same screen rows.
- [ ] F20.T8 The highlight is in the <strong>pane's own colour</strong>, select in two different panes and the colours differ.
- [ ] F20.T9 Drag past the end of a short line, the highlight stops where the text stops, not out to the pane's edge.
- [ ] F20.T10 <kbd>⌘X</kbd> on text <strong>you just typed</strong> at the prompt: it copies AND removes it.
- [ ] F20.T11 <kbd>⌘X</kbd> on output further up: it copies and changes nothing on screen. That is the limit, not a bug, output cannot be unwritten, and we cannot yet tell where a prompt ends.
- [ ] F20.T12 Dragging extends the selection, and it stops at the pane's edge rather than running past it.
- [ ] F20.T13 <kbd>⌘C</kbd> copies the selection, paste it somewhere else to confirm.
- [ ] F20.T14 A click with no drag clears the selection.
- [ ] F20.T15 With two panes, a drag started in one keeps selecting in that one even if the pointer wanders into the other.

### F21 — Paste
- How: <kbd>⌘V</kbd>, or Edit → Paste.
- [ ] F21.T1 Copy a word elsewhere and paste it, it appears at the prompt.
- [ ] F21.T2 Copy <strong>two lines</strong> and paste, the first line must <em>not</em> run on its own.
- [ ] F21.T3 Paste text copied from a Windows-style file, if you have any, no stray blank line or early Enter.
- [ ] F21.T4 The Edit → Paste menu item does the same as the chord.

### F22 — Word and line editing
- How: <kbd>⌥⌫</kbd> deletes a word. <kbd>⌘⌫</kbd> deletes to the start of the line. <kbd>⌥←</kbd> / <kbd>⌥→</kbd> move by word.
- [ ] F22.T1 Type a few words, then <kbd>⌥⌫</kbd>, one word disappears, not the whole line.
- [ ] F22.T2 <kbd>⌘⌫</kbd> clears back to the start of the line.
- [ ] F22.T3 <kbd>⌥←</kbd> and <kbd>⌥→</kbd> jump the cursor a word at a time.
- [ ] F22.T4 A plain <kbd>⌫</kbd> still deletes one character, and plain arrows still move one character.

### F23 — Scrollback
- How: Wheel or trackpad over a terminal pane.
- [ ] F23.T1 A <strong>slow</strong> trackpad drag scrolls smoothly rather than doing nothing then jumping.
- [ ] F23.T2 A fast flick scrolls proportionally.
- [ ] F23.T3 Scrolling follows the pointer, not the focus: hover an unfocused pane and scroll it.
- [ ] F23.T4 It stops at the top of history rather than wrapping or freezing.

### F24 — Text fits the pane
- How: Make a pane narrower and watch the prompt.
- Note: This shared its cause with the selection bug: the shell was told about columns that do not fit.
- [ ] F24.T1 The prompt's right-aligned clock stays on the same line while there is room for it.
- [ ] F24.T2 Long output wraps at the pane's real edge, not several columns early.
- [ ] F24.T3 Resize a pane while output is scrolling, the shell reflows to the new width.
- [ ] F24.T4 <strong>Drag the window edge slowly.</strong> It should feel smoother than before, the strip and header text is now worked out a few times a second rather than every frame, which was hundreds of syscalls a second during a drag.
- [ ] F24.T5 While dragging, the tab name and branch may lag by a fraction of a second. That is the cache. Say if you can notice it.
- [ ] F24.T6 <strong>Drag the window edge slowly and watch the shell prompt.</strong> It should no longer duplicate or garble, the shell is told the new size once, ~120ms after you stop, instead of at every width you passed through.
- [ ] F24.T7 The grid is briefly the wrong shape for its pane while dragging, then snaps. That is the trade. Say if the delay is too long.
- [ ] F24.T8 Check the clock in the top-right of the prompt again after a drag. If it still wraps: does a <code>clear</code> fix it?
- [ ] F24.T9 <strong>Open a fresh window.</strong> It shows a login banner and a prompt, and NOT a command echoed twice. That duplicate was written at startup, before the shell existed, and is what a resize was reflowing into view.
- [ ] F24.T10 Now drag the window edge. Nothing should duplicate.
- [ ] F24.T11 Split, then resize, a new pane's name appears <strong>immediately</strong>, not a quarter second later.

## Menus
the menu belongs to what you clicked

### F25 — Right-click gives a different menu per target
- How: Right-click a pane, a tab row, and the strip's empty area.
- Note: Close Tab is missing from the tab menu: it needs an action and a chord first. Groups are absent by decision (ADR 0013), a tab holding several panes is the group.
- [ ] F25.T1 On a <strong>pane</strong>: Split Pane, Split Plugin Pane, Close Pane, Toggle Plugin, Copy.
- [ ] F25.T2 On a <strong>tab row</strong>: Rename Tab, New Tab, and no Split Pane, no Copy.
- [ ] F25.T3 On the strip's <strong>empty area below the last tab</strong>: New Tab, Open Launch Config, Save Layout, and no Rename.
- [ ] F25.T4 Focus one pane, right-click a <strong>different</strong> one, pick Split, it splits where you clicked.
- [ ] F25.T5 Right-click a tab row that is not active, pick Rename, it renames that row.

## Launch configurations
save a window, open it again

### F26 — Save the current layout
- How: <kbd>⌃⇧S</kbd>, or File → Save Layout.
- [ ] F26.T1 The field opens pre-filled with the tab's name.
- [ ] F26.T2 Saving writes a file into <code>~/.config/forgeterm/launch/</code>.
- [ ] F26.T3 It refuses a name that already exists, and refuses a name with a <code>/</code> in it.
- [ ] F26.T4 Split into a few panes first, save, and check each pane's directory was recorded, not just one for the whole tab.

### F27 — Open a launch configuration
- How: <kbd>⌃⇧L</kbd>, or File → Open Launch Config.
- [ ] F27.T1 With nothing saved, it reports so rather than showing an empty window with no explanation.
- [ ] F27.T2 After saving one, it lists it.
- [ ] F27.T3 Opening it rebuilds the tabs and the pane arrangement.
- [ ] F27.T4 Each pane starts in the directory it was saved in.

### F28 — A config asks before running commands
- How: Open a config whose panes carry startup commands.
- [ ] F28.T1 It lists the commands and asks before running any of them.
- [ ] F28.T2 Choosing Run runs them. Choosing Cancel runs nothing.
- [ ] F28.T3 Opening the same config a second time does <strong>not</strong> ask again.
- [ ] F28.T4 Editing a command in the file makes it ask again.
- [ ] F28.T5 A config with no commands never asks.

## Plugins
the extension surface

### F29 — The plugin pane
- How: The runner, on the right. Type a command and press Enter.
- [ ] F29.T1 It runs the command and streams its output into the pane.
- [ ] F29.T2 Its text input takes keystrokes, and Escape clears it.
- [ ] F29.T3 Scrolling inside the plugin pane scrolls the plugin, not the terminal.
- [ ] F29.T4 It shares the same card style as a terminal pane, same corners, border and header.

### F30 — Plugin hot reload
- How: Rebuild the runner plugin while ForgeTerm is running.
- Note: The swap only lands on the next drawn frame, on an idle window nothing appears to happen until you type.
- [ ] F30.T1 The new build appears without restarting the window.
- [ ] F30.T2 A command the plugin started keeps streaming across the swap, with no gap and no repeat.
- [ ] F30.T3 The terminal panes and their shells are undisturbed.

## Anything else

### F44 — Full-screen programs
- How: Run something that draws its own interface: <code>claude</code>, <code>htop</code>, <code>vim</code>, <code>less</code>.
- Note: Still not read: blinking, and the curly/dotted/dashed underline styles. Nothing seen so far uses them, say if something does.
- [ ] F44.T1 <strong>Run <code>claude</code>.</strong> Its box, input line and status row draw properly, this was collapsing into flat text.
- [ ] F44.T2 <code>echo $TERM</code> shows <code>alacritty</code> or <code>xterm-256color</code>, never empty and never <code>dumb</code>.
- [ ] F44.T3 Coloured <strong>backgrounds</strong> appear: a selected row, a status bar, a highlighted match.
- [ ] F44.T4 Inverse video works, <code>printf '\033[7mINVERSE\033[0m\n'</code> shows light-on-dark.
- [ ] F44.T5 Emoji or CJK text lines up: <code>echo '日本語テスト'</code> then a line of <code>-</code> under it, and check nothing drifts sideways.
- [ ] F44.T6 <code>htop</code> or <code>top</code> fills the pane and its columns align.
- [ ] F44.T7 Resize the pane while a TUI is running, it redraws to the new size.
- [ ] F44.T8 Bold text is <strong>heavier</strong>: <code>printf '\033[1mBOLD\033[0m normal\n'</code>.
- [ ] F44.T9 Dim text is fainter, italic is slanted, underline has a line under it.
- [ ] F44.T10 In <code>claude</code>, its headings and its selected item stand out from the body text rather than all reading the same.

### F32 — Ghost completion
- How: Type a command with a spec installed (<code>git</code>, <code>cargo</code>). A dim suggestion appears after the cursor.
- Note: It suggests from the line WE sent the shell (ADR 0017), so after <kbd>↑</kbd> for history it will suggest for a line you are not on. Accepting then types the wrong text. That is the known divergence, and shell integration is what fixes it.
- [ ] F32.T1 Type <code>gi</code>, a dim <code>t</code> appears after the cursor.
- [ ] F32.T2 <kbd>→</kbd> accepts the whole suggestion.
- [ ] F32.T3 <kbd>⌥→</kbd> accepts one word of it. With today's specs a suggestion has no spaces, so this behaves the same as <kbd>→</kbd>, that is expected, not a bug.
- [ ] F32.T4 With <strong>no</strong> suggestion showing, <kbd>→</kbd> still moves the cursor and <kbd>⌥→</kbd> still jumps a word.
- [ ] F32.T5 An empty prompt shows no suggestion at all.
- [ ] F32.T6 Only the focused pane shows one, split, and check the other pane stays clean.
- [ ] F32.T7 <kbd>Tab</kbd> still opens the full dropdown. The two do not fight.

### F33 — The shortcuts tab
- How: <kbd>⌘/</kbd>, or the <strong>forgeterm</strong> menu → Keyboard Shortcuts.
- [ ] F33.T1 It opens in a <strong>new tab</strong> named Shortcuts.
- [ ] F33.T2 The list is grouped by menu, forgeterm, File, Edit, View, Window, and matches the menu bar.
- [ ] F33.T3 Every chord shown actually works.
- [ ] F33.T4 Typing in the shortcuts tab does nothing, and does not leak keystrokes into a shell in another tab.
- [ ] F33.T5 Closing the tab leaves no stray process behind.
- [ ] F33.T6 The list fits on one screen. Say if it does not, there is no scrolling in it.

### F34 — Shell integration
- How: The shortcuts tab (<kbd>⌘/</kbd>) ends with the lines to paste into <code>~/.zshrc</code>. Paste them, open a new tab, then run things.
- Note: This phase adds no visible feature on purpose, it is the plumbing three later ones need. What you are testing is that installing it changes NOTHING you can see. If your prompt is powerlevel10k it already sends these same markers. That collision cost two bugs and is now handled, so p10k users are the interesting case here.
- [ ] F34.T1 The shortcuts tab has a <strong>Shell integration</strong> section at the bottom, with the hook printed in full.
- [ ] F34.T2 It says ForgeTerm never edits <code>~/.zshrc</code> for you.
- [ ] F34.T3 <strong>Check your <code>~/.zshrc</code> was not touched.</strong> Nothing here may write to it, that is the whole rule.
- [ ] F34.T4 Paste the lines into <code>~/.zshrc</code>, open a new tab, and run a command, nothing visible should change yet (P2 is what puts it on screen).
- [ ] F34.T5 Run something that takes a while (<code>sleep 5</code>), the terminal must stay responsive and the output identical to before.
- [ ] F34.T6 Nothing stray appears on screen: no <code>133</code>, no stray <code>;</code>, no escape codes leaking into the output.
- [ ] F34.T7 Run a full-screen program (<code>claude</code>, <code>htop</code>) with the hook installed, it must look exactly as it did without it.
- [ ] F34.T8 <code>cd</code> around, the tab subtitle still follows the directory and does not lag or stick.
- [ ] F34.T9 Remove the lines again and everything keeps working exactly as it does now.

### F35 — A row says what is running
- How: With the hook from F34 installed, run something slow (<code>sleep 10</code>, <code>cargo build</code>) and watch the tab strip and the pane headers.
- Note: Un-hooked, three sources are tried in order: the shell's command line, the kernel's foreground process, then the directory. Only the first knows <em>which</em> push. The second only knows <code>git</code>. Both are meant to work, the second is what everyone without the hook gets.
- [ ] F35.T1 Run <code>sleep 10</code>, the tab row's <strong>top line</strong> becomes <code>sleep 10</code>, not the directory.
- [ ] F35.T2 The directory is still there, as the row's <strong>subtitle</strong> underneath. It was not traded away.
- [ ] F35.T3 When the command finishes the row goes back to the directory name, it does <strong>not</strong> keep showing the last command.
- [ ] F35.T4 The pane header says the same thing as the row that stands for that pane. They must never disagree.
- [ ] F35.T5 <strong>Split, and run something different in each pane.</strong> Four panes running four things say four things.
- [ ] F35.T6 Rename a tab (<kbd>⌃⇧R</kbd>), then run a command in it, <strong>the name you typed survives</strong>. This is the one that must not break.
- [ ] F35.T7 Run a multi-line command (a <code>for</code> loop), the row shows the first line only, with no box characters or stray glyphs.
- [ ] F35.T8 <strong>Remove the hook from <code>~/.zshrc</code>, open a new tab.</strong> The row now names the <em>program</em> (<code>git</code>, <code>cargo</code>) instead of the whole line, and the directory when idle. Nothing is empty or broken.
- [ ] F35.T9 Nothing gets slower, type into a pane while another is running something and it stays responsive.

### F36 — Completion reads the real line
- How: With the hook installed (F34), type at a prompt and watch the ghost. Compare with a tab where the hook is <em>not</em> installed.
- Note: The hook now reports your line on every redraw, over a code that is ForgeTerm's own (ADR 0024). OSC 133 only reports a command <em>after</em> Enter, which is too late for completion. The hook stays silent outside ForgeTerm, so it will not print junk in Terminal.app. Worth checking if you use other terminals.
- [ ] F36.T1 Type <code>gi</code>, the ghost still appears as before. Nothing regressed.
- [ ] F36.T2 <strong>Press <kbd>↑</kbd> for a previous command, then <kbd>→</kbd>.</strong> It completes the line you are actually on, this was the known-broken case.
- [ ] F36.T3 Type a line, press <kbd>⌃W</kbd> to delete a word, then check the ghost matches what is left on screen.
- [ ] F36.T4 Use the <strong>shell's own</strong> <kbd>Tab</kbd> completion, then check the ghost follows it.
- [ ] F36.T5 <strong>Move the cursor left</strong> with <kbd>←</kbd> into the middle of a line, the suggestion follows the cursor, not the end of the line.
- [ ] F36.T6 Press <kbd>⌃U</kbd>, the suggestion disappears with the line.
- [ ] F36.T7 Run a command. While it runs, no suggestion is offered for it.
- [ ] F36.T8 In a tab with <strong>no</strong> hook installed, all of the above behaves as it did before, same as your last pass, wrong after <kbd>↑</kbd>. That is expected.
- [ ] F36.T9 Typing does not feel slower with the hook installed. Hold a key down and check.
- [ ] F36.T10 In a <strong>bash</strong> shell nothing changes at all, bash gets no line reporting, on purpose.

### F37 — Shells that outlive the window
- How: Start the session server first, <code>cargo run --release --bin forgeterm-session &</code>, then open ForgeTerm. Without the server everything still works, it just does not survive.
- Note: Two things to know. <strong>Editing <code>crates/core</code> or the protocol is a SERVER rebuild</strong>, restarting it kills every shell. Only window side edits survive. And the window does not start the server for you yet (todo12#P4), so launch <code>forgeterm-session</code> first. The layout is used only when it matches what is running exactly, if anything disagrees you get one tab per shell instead, which loses the arrangement and never the work.
- [ ] F37.T1 With the server running, open ForgeTerm and use it normally. Nothing should look or feel different.
- [ ] F37.T2 Run something with state (<code>claude</code>, <code>vim</code>, a long build), then <strong>quit ForgeTerm</strong> and start it again.
- [ ] F37.T3 <strong>It reattaches.</strong> Your tabs come back, same shells, same scrollback, no new processes started.
- [ ] F37.T4 <strong>Split a pane, then restart.</strong> The split comes back: same direction, same ratio, same shell in the same half.
- [ ] F37.T5 A <strong>plugin pane</strong> comes back too, but empty. A plugin’s state survives a hot reload, not a restart. Expected, not a bug.
- [ ] F37.T6 Rename a tab, restart, the name you typed is still there.
- [ ] F37.T7 The tab you were <em>on</em> is the one that opens.
- [ ] F37.T8 <strong>Close a tab</strong> (which kills its shell), then restart, it stays gone, and the others come back normally.
- [ ] F37.T9 Rebuild only the window (<code>cargo build</code>, no changes under <code>crates/core</code>) and relaunch, the server keeps running and the shells with it.
- [ ] F37.T10 <strong>Kill the server</strong> and check ForgeTerm does not hang or crash. It should keep drawing and say something rather than freeze.
- [ ] F37.T11 Start ForgeTerm with NO server running, everything works exactly as before, shells die with the window. That fallback is deliberate.
- [ ] F37.T12 Start the server twice, the second one exits quietly instead of taking over the socket.
- [ ] F37.T13 Delete <code>~/.forgeterm/session.sock</code> while the server runs, then start another server, it must not end up with two sets of shells.
- [ ] F37.T14 Typing does not feel slower than before, in either mode. Hold a key down in a full-screen program.

### F38 — The input bar
- How: With the shell hook installed (F34), look at the bottom of any terminal pane.
- Note: The bar shows the line the SHELL says it is editing (ADR 0024), so it is right after ↑, ⌃W and the shell’s own completion. It is not yet the only place a command is composed, zsh still draws its own prompt above, so you will see the line twice. Making the shell stop drawing is the next phase.
- [ ] F38.T1 A bar sits at the bottom of the pane, <strong>inside</strong> the card, not overlapping its border.
- [ ] F38.T2 The line you are typing appears in the bar, with your cursor in the right place inside it.
- [ ] F38.T3 Move the cursor with ← →, the caret in the bar follows it.
- [ ] F38.T4 The working directory is on the <strong>left</strong> of the bar, the git branch on the <strong>right</strong>.
- [ ] F38.T5 <kbd>⌃U</kbd> clears the line, <strong>the bar stays</strong>. It must not disappear and take two rows with it.
- [ ] F38.T6 <strong>Split the pane.</strong> Each half has its own bar with its own line. The unfocused one is dimmer.
- [ ] F38.T7 Terminal output above the bar never draws over it, or past the card, at any pane size.
- [ ] F38.T8 Make a pane very small by dragging the divider, nothing spills outside the card.
- [ ] F38.T9 <strong>In a pane with no hook installed there is no bar at all</strong>, and the pane looks exactly as it did before.
- [ ] F38.T10 Run a full-screen program (<code>claude</code>, <code>htop</code>), say what the bar does. It is an open question and your answer decides it.

### F39 — Notifications and autostart
- How: Nothing to install. Just use it.
- Note: The window starts the server for you now. A rebuild of the SERVER still kills the shells, that is anything under crates/core, crates/proto or crates/session. Window-only edits keep them.
- [ ] F39.T1 Run something that takes over 30 seconds (<code>sleep 35</code>), switch to another app, and wait, a notification arrives when it finishes.
- [ ] F39.T2 The notification body shows only the command’s <strong>first word</strong>, never its arguments. This is on purpose: arguments carry passwords and keys, and the OS stores notification bodies.
- [ ] F39.T3 A command that fails says so in the title, with its exit code.
- [ ] F39.T4 A command shorter than 30 seconds notifies nothing.
- [ ] F39.T5 <strong>Say if no notification appears at all.</strong> ForgeTerm is not a signed <code>.app</code> bundle, and macOS may refuse it silently, nothing in the test suite can see this.
- [ ] F39.T6 You no longer need to start <code>forgeterm-session</code> by hand: open ForgeTerm with no server running and check <code>ps</code>, it started one.
- [ ] F39.T7 Open a second ForgeTerm at the same time, still exactly one server, not two.
- [ ] F39.T8 Quit and reopen, your tabs, splits and plugin panes come back as before.

### F40 — Zoom, palette, Close Tab
- How: Three new chords. Try them in a tab with a few panes.
- Note: That last one is the bug worth hunting: a nested boundary is named by an address no pane has, and an earlier version pointed the focus at it, which made every keystroke vanish until you clicked. If typing ever stops working after a drag, say so.
- [ ] F40.T1 <kbd>⌃⇧Z</kbd> makes the focused pane fill the whole tab.
- [ ] F40.T2 <kbd>⌃⇧Z</kbd> again puts the other panes back <strong>exactly as they were</strong>, same sizes, same order.
- [ ] F40.T3 While zoomed, the shell resizes to the bigger area, run <code>tput cols</code> and check it grew.
- [ ] F40.T4 Close the zoomed pane, the tab does not go blank.
- [ ] F40.T5 <kbd>⌘⇧P</kbd> opens a command palette listing every shortcut.
- [ ] F40.T6 Type to filter it. Pick something with Enter, it does exactly what its chord does.
- [ ] F40.T7 Open it again, what you just picked is now at the top.
- [ ] F40.T8 <kbd>⌘W</kbd> closes the tab. The last tab refuses to close.
- [ ] F40.T9 Right-click a tab row. Close Tab is in the menu now.
- [ ] F40.T10 <strong>Drag a divider between two nested splits</strong> (split, then split one half again). It should move, and afterwards, typing must still go to a pane.

### F41 — Settings
- How: Edit <code>~/.config/forgeterm/config.toml</code>. Every one of these needs a restart, that is deliberate.
- Note: Settings are read once at startup, on purpose, a terminal is not retheme-mid-session software. Two of them make that structural: a window created opaque cannot be made see-through afterwards, and density is fixed for the run.
- [ ] F41.T1 <code>cursor = bar</code>, the cursor becomes a thin vertical line. Then <code>underline</code>, then <code>block</code>.
- [ ] F41.T2 <code>density = compact</code>, pane headers and text insets tighten. Everything still lines up. No text touches a border.
- [ ] F41.T3 <code>opacity = 0.85</code>, the window background lets the desktop through, but <strong>text and panels stay solid</strong>.
- [ ] F41.T4 <code>opacity = 2</code>. ForgeTerm refuses it and says so, rather than silently using 1.
- [ ] F41.T5 <code>blur = true</code> with opacity under 1, what shows through is blurred. <strong>Say if it does nothing:</strong> no test can see this one.
- [ ] F41.T6 Make <code>~/.config/forgeterm/themes/mine.toml</code> with a <code>background</code> and an <code>accent</code>, set <code>theme = mine</code>, the colours change.
- [ ] F41.T7 Set <code>theme_light</code> too, then switch macOS to Light Mode and restart, the light theme is used.
- [ ] F41.T8 Point <code>theme</code> at a name with no file. ForgeTerm still starts, with the colours it had.
- [ ] F41.T9 <code>notify_after = 5</code>, a five-second command now notifies. <code>notify_after = 0</code>, nothing ever notifies.

### F42 — The transcript hangs from the bottom
- How: Open a fresh pane and run one short command, <code>ls</code> will do.
- Note: This is ADR 0028. The rows and the pty are unchanged, only where row 0 is drawn moves. Five separate places convert a pixel to a cell (drawing, two link hit-tests, the completion caret, selection), so T4–T5 are the ones that catch a shift applied to the picture and forgotten in the input.
- [ ] F42.T1 The output sits at the <strong>bottom</strong> of the pane, right above the input bar, not floating in the middle with a gap under it.
- [ ] F42.T2 The empty space is <strong>above</strong> the text, where there is nothing to read.
- [ ] F42.T3 Run more commands until the pane fills. Once it is full the text stops moving down and scrolls normally, no jump, no lost first line.
- [ ] F42.T4 <strong>Drag-select across a line of output.</strong> The highlight lands on the characters you dragged over, not rows above them.
- [ ] F42.T5 <strong>Click a path in the output.</strong> It opens, and hovering underlines the path under the pointer, not one somewhere else.
- [ ] F42.T6 <strong>Run <code>vim</code> or <code>htop</code>.</strong> It fills the whole pane from the top and its status line is on the last row, NOT pushed under the input bar.
- [ ] F42.T7 Quit the full-screen program, the transcript goes back to hanging from the bottom.
- [ ] F42.T8 Scroll up into history, then back down. Nothing shifts by a line at either end.

### F43 — Blocks, the input box, and the pane header
- How: Run three or four short commands in a pane, include one that fails (<code>false</code>) and one that prints nothing.
- Note: ADRs 0029 and 0030. Known limit, worth trying to break: several prompts between two frames, a script driving the shell rather than you typing, all read as one row and collapse into one block. Typing by hand should never do it. Say so if it does.
- [ ] F43.T1 Each command gets its own <strong>header row</strong>: <code>❯ the command</code> on the left, the directory and how long it took on the right.
- [ ] F43.T2 A <strong>rule</strong> separates each block from the next. No rule above the very first one.
- [ ] F43.T3 <strong><code>false</code></strong>, its header turns red and shows <code>✕ 1</code>. A command that succeeds gets no tick and no colour.
- [ ] F43.T4 <strong>A command that prints nothing still gets its own block.</strong> Run <code>false</code> then <code>date</code>: two headers, not one header with the other's output under it.
- [ ] F43.T5 The command you typed is readable in the header, it is nowhere else, since the prompt is suppressed.
- [ ] F43.T6 <strong>The input box</strong> is a real box with a border and a <code>❯</code>, at the bottom. Nothing else is inside it, no directory, no branch.
- [ ] F43.T7 The box's border takes the accent colour in the focused pane and a plain grey in the others. Split a pane to check both at once.
- [ ] F43.T8 <strong>The pane header</strong> carries the directory and the branch, at its right end, beside the pane's name.
- [ ] F43.T9 <code>cd</code> somewhere else, the header's path follows, and the pane's name does not have to.
- [ ] F43.T10 <strong>Drag-select across a line of output.</strong> The highlight lands where you dragged, not a row or two off, the rows are no longer evenly spaced.
- [ ] F43.T11 <strong>Drag across a block header.</strong> The selection keeps going rather than freezing.
- [ ] F43.T12 <strong>Click a block header.</strong> It selects nothing, a click there is on the header.
- [ ] F43.T13 <strong>Run <code>vim</code>.</strong> No block chrome at all inside it, and its status line is on the last row.
- [ ] F43.T14 Fill the pane with output. The oldest lines go off the <strong>top</strong> and you can scroll up to them. Nothing is lost off the bottom.

### F45 — The file explorer
- How: Click the folder button in the top bar, right of the <code>+</code>. Or press <kbd>⌃⇧E</kbd>. Move with the arrow keys or with <code>hjkl</code>.
- Note: Everything from the marking down was written months ago and reachable by nothing at all. It was wired up on 21 August. The columns and the preview were in the same state. If one of these does nothing, that is worth knowing, because none of it has been used by a person yet.
- [ ] F45.T1 Press <kbd>⌃⇧E</kbd>. — Pass: An explorer pane opens beside the terminal, showing the directory your shell is in.
- [ ] F45.T2 Close it and click the folder button instead. — Pass: Same thing. You do not need to know the chord.
- [ ] F45.T3 Press <kbd>↑</kbd> and <kbd>↓</kbd>, then <code>k</code> and <code>j</code>. — Pass: The highlight moves one row at a time.
- [ ] F45.T4 Press <kbd>→</kbd> on a folder, then <kbd>←</kbd>. — Pass: Right goes into the folder. Left comes back out. <code>l</code>, <code>h</code> and Enter do the same.
- [ ] F45.T5 Go three folders deep with <kbd>→</kbd>, then come all the way back with <kbd>←</kbd>. — Pass: Each time you come out, the highlight is on the folder you just left.
- [ ] F45.T6 Click a row with the mouse. — Pass: The highlight moves to the row you clicked, not one above or below it.
- [ ] F45.T7 Click the path at the very top, then click the empty space under the last file. — Pass: Nothing moves. Neither of those is a row.
- [ ] F45.T8 Double click a folder. — Pass: It opens it, same as <kbd>→</kbd>. Double click a file and nothing happens, because a file is not somewhere to go.
- [ ] F45.T9 Click one row, wait two seconds, click it again. — Pass: The highlight moves twice and does NOT open it. Two slow clicks are not a double click.
- [ ] F45.T10 Scroll the wheel over the explorer. — Pass: The highlight moves down the list. Pushing the wheel away from you moves down, the same as in any document.
- [ ] F45.T11 Press space on a file. — Pass: A bar appears down the left of that row, and the highlight moves to the next row. Press space again on a marked row to unmark it.
- [ ] F45.T12 Press <code>/</code> and type a few letters. — Pass: The list narrows to what matches. It matches letters in order, not only whole words, so <code>rpt</code> finds <code>report.md</code>. The filter shows next to the path at the top.
- [ ] F45.T13 Press <code>/</code> and submit it empty. — Pass: The whole directory comes back.
- [ ] F45.T14 Turn a filter on, then go into another folder. — Pass: The filter is dropped. It was typed for the folder you were in, not this one.
- [ ] F45.T15 Mark a file, press <code>y</code>, go to another folder, press <code>p</code>. — Pass: The file is copied there. The original is still where it was.
- [ ] F45.T16 Do the same with <code>m</code> instead of <code>y</code>. — Pass: The file MOVES. The original is gone. Press <code>p</code> a second time and nothing happens, because a cut is used up.
- [ ] F45.T17 Press <code>p</code> without copying anything first. — Pass: It tells you there is nothing to paste. It does not fail silently.
- [ ] F45.T18 Try to paste a folder into itself. — Pass: It refuses instead of copying forever.
- [ ] F45.T19 Press <kbd>⇧D</kbd>. — Pass: It asks first, and it LISTS the exact files it would take. Press Cancel and nothing is deleted.
- [ ] F45.T20 Do it again and confirm. — Pass: The files go to the trash, check <code>~/.Trash</code>, and the pane stops showing them.
- [ ] F45.T21 Mark three rows, then press <code>y</code>, <code>m</code> or <kbd>⇧D</kbd>. — Pass: It acts on all three, not on the one under the highlight.
- [ ] F45.T22 Press <code>.</code> then <code>s</code>. — Pass: Dot shows and hides dotfiles. S cycles the order, name, then size, then modified.
- [ ] F45.T23 Right click inside the pane. — Pass: The menu lists Open, Go Up, Show Hidden Files, Sort, Mark, Search, Copy, Cut, Paste and Move to Trash. Each does the same as its key.
- [ ] F45.T24 Make the pane wider. — Pass: Parent folders appear as columns on the left, with the folder you are in beside them. Make it narrow again and they drop off from the left first.
- [ ] F45.T25 Highlight a text file. — Pass: A preview appears on the right. Move down a few files and it follows.
- [ ] F45.T26 Highlight a folder, then something binary such as a compiled file. — Pass: The folder preview lists what is inside. The binary one says <code>binary</code> rather than drawing rubbish.
- [ ] F45.T27 Highlight a very large file. — Pass: It says the size and that it is too large to preview. It does not freeze.
- [ ] F45.T28 Open a folder you have no permission for. — Pass: It says why, in red. An empty folder says <code>empty</code>. Those two must not look the same.
- [ ] F45.T29 Open a huge folder such as <code>/usr/bin</code>. — Pass: It opens without the window freezing. Past 5000 files the size column is blank, and every file is still listed.
- [ ] F45.T30 Open an explorer, quit ForgeTerm, open it again. — Pass: The explorer comes back in the same folder, not at your home folder and not blank.

### F46 — Clickable paths
- How: Run something that prints links, <code>ls --hyperlink=always</code> if you have GNU ls, or any command whose output your shell marks.
- Note: ADR 0020: only <code>file://</code>, <code>http://</code> and <code>https://</code> are opened. Anything else a program marks is drawn but never handed to the system.
- [ ] F46.T1 Hover a marked path: it underlines, and only while the pointer is on it.
- [ ] F46.T2 Nothing is underlined when the pointer is elsewhere, no permanent underlines on every path in the scrollback.
- [ ] F46.T3 Click it: it opens in whatever your Mac uses for that file.
- [ ] F46.T4 Hover a link over a block header or a rule, nothing underlines, because that is chrome, not output.
- [ ] F46.T5 Scroll so a link moves, then hover where it USED to be, nothing underlines there.

### F47 — A plugin showing an image
- How: The <b>icon-demo</b> plugin in <code>plugins/</code>. Split a plugin pane and pick it.
- Note: ADR 0010: the plugin names a file and the HOST opens it. A plugin never gets a path or a file handle of its own.
- [ ] F47.T1 The plugin draws an image, not a description of one.
- [ ] F47.T2 Resize the pane, the image stays inside it.
- [ ] F47.T3 Close and reopen the pane, the image comes back.

### F48 — The integration installs itself
- How: Nothing to install. This is the one to try with your <em>real</em> <code>.zshrc</code>.
- Note: ADR 0032, copied from Warp's own bootstrap: ForgeTerm starts zsh with its own <code>ZDOTDIR</code>, whose rc sources yours and then adds the hooks. ADR 0031 is the last two: nothing is taken away from a shell we cannot read.
- [ ] F48.T1 <strong>You did not edit anything.</strong> Open a new tab: the input box is there, and your prompt is not drawn in the transcript.
- [ ] F48.T2 Your <code>.zshrc</code> still works, aliases, functions, <code>$PATH</code>, everything it normally sets.
- [ ] F48.T3 powerlevel10k, oh-my-zsh and your plugins all still load.
- [ ] F48.T4 No <code>Last login:</code> line in a fresh pane, and check <code>~/.hushlogin</code> was NOT created.
- [ ] F48.T5 <code>echo $ZDOTDIR</code>, it says your own, not ForgeTerm's temp directory.
- [ ] F48.T6 Open five tabs at once. Every one of them has an input box. None comes up with a prompt in the transcript.
- [ ] F48.T7 <strong>Now try a shell with no integration:</strong> <code>bash</code>. It behaves like an ordinary terminal, its prompt is visible and there is no input box.
- [ ] F48.T8 In that bash, type a command and run it. Nothing is swallowed and nothing is drawn twice.

### F49 — Editing the line
- How: Type into the input box and move around in it.
- Note: todo14#P5, #P10, #P11, #P12. Known gap: the caret cannot be moved by clicking a spot in the line yet, dragging selects, but a single click does not reposition it.
- [ ] F49.T1 <code>←</code>/<code>→</code> move the caret through the line, and the caret is drawn where it is.
- [ ] F49.T2 Type in the MIDDLE of a line, the characters go in at the caret, not at the end.
- [ ] F49.T3 <kbd>Backspace</kbd> in the middle takes the character before the caret, not the last one in the line.
- [ ] F49.T4 <kbd>⌥←</kbd>/<kbd>⌥→</kbd> move by word, skipping the spaces between words.
- [ ] F49.T5 <kbd>⌘←</kbd>/<kbd>⌘→</kbd> and Home/End go to the ends of the line.
- [ ] F49.T6 <kbd>⇧</kbd> with any of those extends a selection. The selection is washed behind the text.
- [ ] F49.T7 Drag across the line with the mouse, it selects the line, NOT the output above it.
- [ ] F49.T8 With something selected, type, it replaces the selection.
- [ ] F49.T9 With something selected, press <kbd>Backspace</kbd>, it removes the selection, and only that.
- [ ] F49.T10 <kbd>⌘C</kbd> with a selection in the box copies THAT, not whatever is selected in the transcript.
- [ ] F49.T11 <kbd>⇧⏎</kbd> breaks the line: the box grows a row and the caret is on the new one.
- [ ] F49.T12 Submit a broken line, it runs as one command (try <code>echo one</code> ⇧⏎ <code>echo two</code>).
- [ ] F49.T13 <strong>Press <kbd>Enter</kbd> on an empty line.</strong> Nothing happens, no new block, no gap in the transcript.
- [ ] F49.T14 <kbd>⌘⌫</kbd> clears the whole line in ONE press.
- [ ] F49.T15 <kbd>⌃⇧←</kbd>/<kbd>⌃⇧→</kbd> still resize the pane rather than moving the caret. (This was broken off macOS, fixed and proved by test, but no Linux or Windows machine exists here to try it on.)
- [ ] F49.T16 Run <code>cat</code>, then press <kbd>Enter</kbd> on an empty line, it DOES reach <code>cat</code>, because a command is running.

### F50 — Nothing takes the window down
- How: These are the failures that used to kill everything at once. They are hard to cause on purpose. If you cannot make one happen, say so rather than ticking it.
- Note: Each of these was a real crash, not a worry. The plugin one is a decompression bomb: a 68 byte file can claim to be 60000 by 60000 pixels, which is 10.8 GB once decoded, and the decoder’s own 64 MiB limit does not cover it. That was measured, not assumed.
- [ ] F50.T1 Make a shell that cannot start. Point ForgeTerm at a shell path that does not exist, or open panes until the system runs out of file handles. — Pass: The window stays open. Every other pane and tab still works, with what was on them still there.
- [ ] F50.T2 Look at what it says when that happens. — Pass: It tells you the shell could not start. It does not fail silently or leave an empty pane behind.
- [ ] F50.T3 Open another pane after that failure. — Pass: It works. One failure is not permanent.
- [ ] F50.T4 Select text in a pane you opened AFTER a failure. — Pass: Selecting works everywhere. It used to jam for the rest of the session.
- [ ] F50.T5 Start ForgeTerm while an older copy is already running. — Pass: It tells you your shells are still alive in the old server. It does not quietly open new ones and hide the old.
- [ ] F50.T6 Watch that message. — Pass: It appears once, not on every frame.
- [ ] F50.T7 In the input box, drag across a word with an accent or an emoji, such as <code>café</code>. Drag through the middle of the accented letter. — Pass: The window stays up.
- [ ] F50.T8 Drag with the mouse inside a pane that has nothing in it yet, a fresh pane before any output. — Pass: The window stays up. This used to crash it.
- [ ] F50.T9 Point a plugin at a broken or half downloaded PNG. — Pass: The pane shows no image and the app keeps running. It does not disappear.
- [ ] F50.T10 Open a folder with tens of thousands of files, then walk in and out of it. — Pass: No freeze going in, and none coming back.

### F52 — Several panes at once
- How: Split into three or four terminal panes. Give them all something noisy to do, such as <code>cargo build</code>, <code>yes</code>, and a long <code>find /</code>. This is the one you called not smooth.
- Note: A frame used to ask EVERY pane for a full screen whenever ANY one of them produced output. Four panes cost about 2.5ms of an 8ms budget to fetch three screens that had not changed. Now a pane that said nothing keeps the screen it already had, 842 microseconds down to 172. The last two checks are the ones that matter most. A selection and a tab switch change the picture without the shell sending anything, so both must still refresh. A cache that got those wrong would feel fast and show you stale output.
- [ ] F52.T1 With a build running in one pane, type into another. — Pass: Your letters appear as fast as they do in a quiet window.
- [ ] F52.T2 Set all four panes producing output at once. — Pass: The window keeps up. No stutter, no lag while typing.
- [ ] F52.T3 Watch a pane that is doing nothing while its neighbour is busy. — Pass: It sits still. It does not flicker or redraw.
- [ ] F52.T4 Scroll one pane back through its history while another is busy. — Pass: The scroll is smooth.
- [ ] F52.T5 Select text with the mouse in a quiet pane while a neighbour is busy. — Pass: The highlight appears at once and follows the pointer.
- [ ] F52.T6 Switch tabs while panes are busy. — Pass: The new tab draws straight away. You never see a flash of the old tab.

### F53 — Programs that take the whole screen
- How: Open a pane. Run <code>claude</code>. If you do not use it, <code>vim /tmp/x</code> or <code>htop</code> work the same way. This is the part that was fully broken, so test it first.
- Note: Two faults sat on top of each other here. The pane froze because a crash on the thread that reads the shell killed reading for good, with the window still alive, so no output ever arrived again. And ForgeTerm had no key encoder at all, so a control key arrived as a plain letter. The last check is a third thing: a program asks the terminal questions before it draws, such as what colour the background is, and we never answered.
- [ ] F53.T1 Type <code>claude</code> and press Enter. — Pass: Its screen appears. Before this fix the pane went black and stayed black.
- [ ] F53.T2 Press <kbd>⌃C</kbd>. — Pass: The program stops, or asks you to press it again. It used to type the letter c and nothing else.
- [ ] F53.T3 Press <kbd>⌃D</kbd>, then <kbd>⌃A</kbd>, then <kbd>⌃E</kbd>. — Pass: Each one does what that program says it does. None of them types a letter.
- [ ] F53.T4 Press the four arrow keys. — Pass: The program moves. ForgeTerm does not steal them for its own cursor.
- [ ] F53.T5 Press <kbd>Tab</kbd> inside the program. — Pass: The program gets a real Tab. ForgeTerm normally uses Tab to complete a command, and it must not do that here.
- [ ] F53.T6 Press <code>Delete</code>, <code>PageUp</code>, <code>PageDown</code>, <code>Home</code>, <code>End</code>, then <code>F1</code>. — Pass: Every key reaches the program. All of these used to send nothing at all.
- [ ] F53.T7 In <code>vim</code>, hold <kbd>⇧</kbd> and press an arrow, then hold <kbd>⌥</kbd> and press an arrow. — Pass: Shift selects text. Option moves one word.
- [ ] F53.T8 While the program is still running, press <kbd>⌘C</kbd>. — Pass: It copies. It does not type a c into the program.
- [ ] F53.T9 While it is still running, press <kbd>⌃⇧O</kbd>. — Pass: The pane splits. ForgeTerm keeps its own chords and hands over every other key.
- [ ] F53.T10 Quit the program. — Pass: The input box comes back and your typing goes into it again.
- [ ] F53.T11 Start <code>claude</code> once more and wait. — Pass: It picks a light or dark look and draws. It does not sit there doing nothing.

### F54 — clear, and where a header sits
- How: A header is the line with the command name and the arrow. Run a few commands, then <code>clear</code>, then a few more. Watch the headers, not only the output.
- Note: Three separate faults came out of one report. `clear` tells the terminal to throw away the scrollback and then to blank the screen, and blanking pushes the screen INTO the scrollback, so what you just cleared is back in history. Nothing shows it until the grid grows, and the grid grows every time the input box changes height. That is why it appeared on the next command. The header position was a second fault, and the headers not moving when the history was erased was a third.
- [ ] F54.T1 Run <code>ls</code> twice, then <code>clear</code>. — Pass: The pane is empty.
- [ ] F54.T2 Now run <code>ls</code> again. — Pass: You see ONE listing. The old ones do not come back. This was the bug, and it showed up on this command rather than on the clear.
- [ ] F54.T3 Look at the headers after that clear. — Pass: Only the new command has one. No header is left over from before.
- [ ] F54.T4 Look at where each header sits. — Pass: Every header is ABOVE its own output, never below it.
- [ ] F54.T5 Run something that prints a lot at once, such as <code>ls -la /usr/bin</code>. — Pass: Its header is still above the listing.
- [ ] F54.T6 After a clear, scroll up with the wheel. — Pass: The cleared screen is gone. You do not find it further up.
- [ ] F54.T7 Run <code>true</code>, which prints nothing, then run <code>ls</code>. — Pass: Each gets its own header, and the ls output is not sitting under the true header.
- [ ] F54.T8 Run <code>printf hello</code>, which prints with no line break at the end. — Pass: KNOWN TO FAIL. The header lands one row below its output. Tick it and move on, this one is already written down as todo17.

### F55 — The command name turns green
- How: Click into the input box and type. Watch the first word only.
- Note: Green only, never red. A missing hint costs you nothing. A colour on something that then fails is a lie.
- [ ] F55.T1 Type <code>claude</code>, slowly. — Pass: The word turns green once it is complete and the program is really installed.
- [ ] F55.T2 Delete it and type <code>gti</code>. — Pass: It stays grey. Nothing turns red. A half typed command is always wrong, and red on every keystroke teaches you to ignore the colour.
- [ ] F55.T3 Type <code>git status</code>. — Pass: Only <code>git</code> is green. The word <code>status</code> is not.
- [ ] F55.T4 Type <code>cd</code>. — Pass: Green. It is built into the shell rather than a file on disk, and it still counts.
- [ ] F55.T5 Type <code>./gate.sh</code>, then <code>/bin/ls</code>. — Pass: Both green. A path counts when it points at something you can run.
- [ ] F55.T6 Type <code>FOO=bar git</code>. — Pass: <code>git</code> is green. The <code>FOO=bar</code> part is not the command.
- [ ] F55.T7 Keep typing arguments after a green command. — Pass: The green stays on the first word and does not slide.
- [ ] F55.T8 Type one of your own aliases or shell functions. — Pass: It may stay grey, and that is expected. Only your shell knows those, and asking it on every keystroke is not worth the cost.

### F31 — General impressions
- How: Anything not covered above.
- [ ] F31.T1 Overall feel: does anything look wrong, slow, or out of place?
- [ ] F31.T2 Anything you expected to exist and could not find?
