
We will work on one main item at a time. Pick the one you want to work on then discuss it with me so we both have a clear understanding and can complete the item fully and test it fully. 

___

# To-do: 

1. Hyphenate: add to typography setting wherever there is a setting to enable justify text. 
2. [x] Separate items in typography: these elements now have their own page in typography.
    1. [x] Bold
    2. [x] Italic
    3. [x] Links
    4. [x] Inline code
    5. [x] Footnotes (already had a separate typography page)
    6. [x] Block quotes
    7. [x] Callouts
    8. [x] Other elements already have separate pages; no additional combined typography page was found.
3. [x] Move the bottom toolbar appearance page below Find & Replace in main settings and name it "Toolbar: Bottom".
4. [x] Clean up redundant wording across settings pages and keyboard shortcut labels.
    1. [x] Rename "Custom Keyboard Shortcuts" to "Keyboard Shortcuts" and remove "Shortcut" from individual key labels.
    2. [x] Remove repeated "Settings" and "Styling" wording where the page or section already makes the context clear.
5. [x] Typography:
    1. [x] Sorting: the typography page needs to be sorted:
        1. Heading 
        2. Paragraph & body text 
        3. Everything else in alphabetical order. 
    2. [x] Add typography controls to sub-elements:
        1. [x] Add an option to inherit typography from "Paragraph & Body Text" for lists, block quotes, callouts, footnotes, and tables.
        2. [x] Font family
        3. [x] Font weight
        4. [x] Letter spacing
        5. [x] Text color
        6. [x] Text size
        7. [x] Text alignment, including justify where applicable
        8. [x] Hyphenation
        9. [x] Line height
        10. [x] Tables were included as another text element; table column alignment remains controlled per column.
6. Bug: Keyboard always shows when returning to app. Implementation added; needs on-device verification.
7. Bug: Keyboard not opening when editing hex in color pallet. 
8. Cursor seems slow to respond vs obsidian. Normal editing no longer runs detailed navigation capture; font CSS and file data are reused when unchanged. Needs on-device verification.
9. [x] Delete or edit image in WYSIWYG without selecting its Markdown:
    1. [x] Tapping an image reveals Edit and Delete actions.
    2. [x] Edit the image description, location, or width; width uses Obsidian's `|width` syntax and preserves proportions.
    3. [x] Deletion requires confirmation and removes only the document reference, not the image file.
10. [x] Font:
    1. [x] Avoid duplicate custom-font declarations and repeated data reads.
    2. [x] Choose installed device font families for body and headings; existing element-family choices use the same device font list.
11. Toolbar keyed toggle on off. 
12. Linter: https://github.com/platers/obsidian-linter
13. Footnotes:
    1. Footnote font size: NOT working.
    2. Footnote text color: NOT working.
    3. Footnote reference color: NOT working.
    4. Footnote back link color: NOT working.
    5. Footnote section background: NOT working.
    6. **footnotes: each setting does not have a reset icon. I think that footnotes are not really functioning properly, probably need a plugin.**
14. Tables:
    1. 
15. Table of contents panel:
    1. Word & character count 
    2. Search 
16. Left side panel:
    1. Add left side panel similar to right table of contents panel: 
    2. Show user's folders: like obsidian file explore in the side panel — can open files from it. 
    3. Vertical tabs: https://github.com/oxdc/obsidian-vertical-tabs 
    4. Search within files? Files that are within the user selected folders? 
17. Link & embed on device files:
    1. Now that the user can set folders, can we use those folders like "vaults" to embed files and link to files? 
        1. During insertion have a field that they can search for item within those folders. Should work the same if they are inserting directly with syntax, similar to obsidian. 
18. 


___

# TOOLBARS \[WIP]:


1. Bottom control/toolbar toggle 
    1. needs color settings for toggle. 
    2. Size needs to be larger when toolbar is closed so it is easier to hit but the size of the toolbar keys when toolbar is open — can this be done? 
2. See gay toolbar: https://github.com/chaskane/gay-toolbar 
3. 

## Discussion:

What we did with the search we are going to do similar for the bottom toolbar and a floating toolbar. 

There will be a "live representation" of the toolbar in the settings like we did with the find & replace. 

Each will have a separate page in settings right next to the find & replace, not in typography. Since the floating toolbar cannot have a toggle its settings needs a enable/disable toggle. 

Like the find & replace there will be a holding area for all available toolbar keys. Those that are in the toolbar already will not show, like the find & replace. However there is no + on the keys, they are added by drag-n-drop only, and they are the icons not text in this holding area. Furthermore the key icon can be changed in this area by quick double tap — opens your paste/choose dialogue. This makes it so when they add the key to a group or action that the custom icon is used instead of the default, tricky I know. 

The holding area is one shared, flat area: popup action keys are shown individually, not nested in their folder. Moving a folder key to the holding area releases each popup key into that area. Popup keys stay assigned to their existing folder when restored; they are not silently reassigned to another folder. An empty folder is hidden from the layout but retained in the configuration unless the user explicitly deletes it. Deleting a custom folder must not implicitly delete its contained keys; release them individually into the holding area.

The big difference is that the toolbars have "groups" and we want to make creating groups a drag-n-drop process just like moving icons around on the android home screen — when a second key is dropped on top of another it creates a group, and more keys can be dropped in. 

Group icons: it takes the icon of the first toolbar key, the custom icon if it was set, but like all keys will have the ability to change it, and the colors of the icon and key background. It will also have the same actions as any key. 

Like the find & replace when an icon is tapped it will show the settings for it. A tap on a group opens the popup and its settings. This gives access to the keys in a group — the toolbar behaves as it normally does. 

The settings will have the color customization for each key. However it will also have actions: long press, single tap, double tap, triple tap, and swipes — 4 or 8, user choice. Four swipes is up, down, left, right. Eight swipes adds the corners.

Actions: include all toolbar actions, open group, close keyboard, ? What else? 

Complicated 🤯

This obsidian toolbar plugin does some of this: https://github.com/chaskane/gay-toolbar

When the user sets an action they get a dialog to search or scroll through the available keys & other actions to pick, and that icon is placed on the parent key in the appropriate location for the swipe — long press goes into the upper left unless the user is using eight swipes then it has no home and is not shown. Just as taps are not shown. 

The main settings for the toolbar has global settings and these need to include the height, colors, padding between the main and popup keys. Etc. — have to pull the "bottom control bar customization" from typography. Hey, I didn't tell anyone to put it there. 

_____

Keyboard focus: this is a big problem for keyboards and toolbars. Whenever a toolbar key is tapped that does not do an immediate action on the text the focus in the text field  is lost and the keyboard closes — this could make double and triple taps very problematic. Opening a group by tap closes the keyboard currently — one possible way to side step this is open group by swipe. Testing swiping on the toolbar: currently does nothing, doesn't open the group or cause the keyboard to close so I'm not sure if the swipe triggering the opening can keep focus in the text field. 


Note: working on the toc side panel the keyboard stayed open though the focus was on the toc panel therefore we should be able to do that for the toolbar — retain focus on the text field thus keep the keyboard open, if it was already open, while interacting with the toolbar. This would stop the up down of the keyboard whether the user uses a toolbar key  that doesn't instantly apply syntax or does, like headings vs bold.