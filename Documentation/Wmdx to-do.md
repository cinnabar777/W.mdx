
We will work on one main item at a time. Pick the one you want to work on then discuss it with me so we both have a clear understanding and can complete the item fully and test it fully. 

___

# To-do: 

1. [x] Hyphenate: add to typography setting wherever there is a setting to enable justify text. Implemented; verify during the later full settings audit.
2. [x] Separate items in typography: these elements need their own page in typography — Jules lumped many together initially but with all the custom settings it feels to cluttered.
    1. [x] Bold
    2. [x] Italic
    3. [x] Links
    4. [x] Inline code
    5. [x] Footnotes
    6. [x] Block quotes
    7. [x] Callouts
    8. [x] Reviewed; no additional combined typography page was needed.
3. [x] Bottom control bar & UI theme: move from typography to main settings page below find & replace and name it "Toolbar: Bottom"
4. [x] Settings: cleanup redundant and unnecessary wording — things like "styling & typography settings", "settings" is redundant because it is the settings.
    1. [x] Rename Custom Keyboard Shortcuts and remove redundant "shortcut" wording from key labels.
5. [x] Typography:
    1. [x] Sorting: the typography page needs to be sorted:
        1. Heading 
        2. Paragraph & body text 
        3. Everything else in alphabetical order. 
    2. [x] Add typography controls to sub-elements:
        1. [x] Inherit typography settings from Paragraph & Body Text.
        2. [x] Font family
        3. [x] Font weight
        4. [x] Letter spacing
        5. [x] Text color
        6. [x] Text size
        7. [x] Text alignment, including justify where applicable
        8. [x] Hyphenation
        9. [x] Line height
6. [x] Bug: Keyboard always shows when returning to app. Fixed and confirmed on device.
7. [x] Bug: Keyboard not opening when editing hex in color pallet. Fixed and confirmed.
8. Cursor seems slow to respond vs obsidian. Needs an on-device check with a release build after toolbar work.
9. [x] Delete or edit image in WYSIWYG without selecting its Markdown:
    1. [x] Tapping an image reveals Edit and Delete actions.
    2. [x] Edit image description, location, or width while preserving proportions.
    3. [x] Deletion requires confirmation and removes only the document reference, not the image file.
10. [x] Font:
    1. [x] Avoid duplicate custom-font declarations and repeated data reads.
    2. [x] Choose installed device font families for body and headings.
11. [x] Toolbar keyed toggle on off.
12. Linter: https://github.com/platers/obsidian-linter
13. [x] Footnotes:
    1. [x] Footnote font size.
    2. [x] Footnote text color.
    3. [x] Footnote reference color.
    4. [x] Footnote back link color.
    5. [x] Footnote section background.
    6. [x] Settings and reset controls; footnotes are confirmed working.
14. [x] Tables: cell editing, merged-cell editing/splitting, selection, and horizontal scrolling are working.
15. [x] Table of contents panel:
    1. [x] Word & character count
    2. [x] Search
16. Left side panel:
    1. Add left side panel similar to right table of contents panel: 
    2. Show user's folders: like obsidian file explore in the side panel — can open files from it. 
    3. Vertical tabs: https://github.com/oxdc/obsidian-vertical-tabs 
    4. Search within files? Files that are within the user selected folders? 
17. Link & embed on device files:
    1. Now that the user can set folders, can we use those folders like "vaults" to embed files and link to files? 
        1. During insertion have a field that they can search for item within those folders. Should work the same if they are inserting directly with syntax, similar to obsidian. 


___


# TOOLBARS:


1. Bottom control/toolbar toggle 
    1. needs color settings for toggle. 
    2. Size needs to be larger when toolbar is closed so it is easier to hit but the size of the toolbar keys when toolbar is open — can this be done? 
2. See gay toolbar: https://github.com/chaskane/gay-toolbar 
3. Key feature off bottom and floating toolbar: ability to make custom keys — start from nothing, add icon(s), select actions for:
    1. 4 to 8 directions 
    2. Tap 
    3. Double tap 
    4. Triple tap 
    5. Long press 
    6. Background color 
    7. Icon color 
    8. How: a "+custom key" button in the bottom right corner off the holding area for all keys. 
        1. Tap it and it opens a popup dialogue that gives a live view off the key as actions and icons are added — user can select icons from those the app has or paste svg or load svg file. 
        2. A selection between using the 4 direction swipes or app eight. 
            1. Fields for each that lists app available actions the app has, with the top a search field. 
            2. An icon selection for each. 
                1. Icons take their spot where the swipe is directed.  See image of keyboard that has multi directional keys. 
        3. Same field as the swipe actions for tap, double, and triple. 
            1. No icons 
        4. Long press action field — icon shows in upper left corner of patent key unless 8 direction swipe is selected then it doesn't show.  
        5. Background color 
        6. Icon color 
            1. By default colors are inherited from the main toolbar settings. 
4. Regular toolbar keys that are already available ought to be customizable just like the custom key. 

## Discussion:

What we did with the search we are going to do similar for the bottom toolbar and a floating toolbar. You need to review the find/replace code to see how the live view was done and the icon colors, especially as they were problematic. 

There will be a "live representation" of the toolbar in the settings like what was done with the find & replace. 

Each toolbar, bottom & floating,  will have a separate page in settings right next to the find & replace, not in typography. Since the floating toolbar cannot have a toggle, its settings needs a enable/disable toggle. 

Like the find & replace there will be a holding area for all available toolbar keys. Those that are in the toolbar already will not show, like the find & replace. However there is no + on the keys, they are added by drag-n-drop only, and they are the icons,  not text, in this holding area. Furthermore the key icon can be changed in this area by quick double tap — opens the edit dialogue. 

The big difference is that the toolbars have "groups" and we want to make creating groups a drag-n-drop process just like moving icons around on the android home screen — when a second key is dropped on top of another it creates a group, and more keys can be dropped in. 

Group icons: it takes the icon of the first toolbar key, the custom icon if it was set, but like all keys will have the ability to change it, and the colors of the icon and key background, and actions. 

When an key is tapped it will show the settings dialogue for it. A tap on a group key opens the popup and its settings dialogue — it is behind and above the toolbar. This gives access to the keys in a group — the toolbar behaves as it normally does. 

The settings will have the color customization for each key. However it will also have actions: long press, single tap, double tap, triple tap, and swipes — 4 or 8, user choice. Four swipes is up, down, left, right. Eight swipes adds the corners.

Actions: include all toolbar actions, open group, close keyboard, etc, ? What else? 

Complicated 🤯

This obsidian toolbar plugin does some of this: https://github.com/chaskane/gay-toolbar

When the user sets an action they get a dialog to search or scroll through the available keys & other actions to pick, and that icon is placed on the parent key in the appropriate location for the swipe — long press goes into the upper left unless the user is using eight swipes then it has no home and is not shown. Just as taps are not shown. 

The main settings for the toolbar has global settings and these need to include the height, colors, padding between the main and popup keys. Etc. — have to pull the "bottom control bar customization" from typography. Hey, I didn't tell anyone to put it there. 

_____

Keyboard focus: this is a big problem for keyboards and toolbars. Whenever a toolbar key is tapped that does not do an immediate action on the text the focus in the text field  is lost and the keyboard closes — this could make double and triple taps very problematic. Opening a group by tap closes the keyboard currently — one possible way to side step this is open group by swipe. Testing swiping on the toolbar: currently does nothing, doesn't open the group or cause the keyboard to close so I'm not sure if the swipe triggering the opening can keep focus in the text field. 


Note: working on the toc side panel the keyboard stayed open though the focus was on the toc panel therefore we should be able to do that for the toolbar — retain focus on the text field thus keep the keyboard open, if it was already open, while interacting with the toolbar. This would stop the up down of the keyboard whether the user uses a toolbar key  that doesn't instantly apply syntax or does, like headings vs bold.
