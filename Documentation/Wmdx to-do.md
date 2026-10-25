
We will work on one main item at a time. Pick the one you want to work on then discuss it with me so we both have a clear understanding and can complete the item fully and test it fully. 

___

# To-do: 

1. Hyphenate: add to typography setting wherever there is a setting to enable justify text. 
2. Separate items in typography: these elements need their own page in typography — Jules lumped many together initially but with all the custom settings it feels to cluttered. 
    1. Bold 
    2. Italic 
    3. Links 
    4. Inline code 
    5. Footnotes (separate typography page added)
    6. Block quotes 
    7. Callouts 
    8. Did I miss any that should be separated? 
3. Bottom control bar & UI theme: move from typography to main settings page below find & replace and name it "Toolbar: Bottom" 
4. Settings: cleanup redundant and unnecessary wording — things like "styling & typography settings", "settings" is redundant because it is the settings. 
    1. Custom keyboard shortcuts → remove custom. Remove "shortcut" from all the keyboard shortcuts, again that's the page they are on therefore it is redundant — Jules did a lot of redundant wording that needs to be reduced. Go through and make your best effort to cleanup this in settings.  
5. Typography:
    1. Sorting: the typography page needs to be sorted: 
        1. Heading 
        2. Paragraph & body text 
        3. Everything else in alphabetical order. 
    2. items to add:
        1. List items, block quote, callouts, footnotes, and maybe others: need to make sure they have setting to customize typography:
            1. **add** a setting to these types of "sub-elements" to inherit these typography setting from "paragraph & body typography". 
            2. font
            3. font weight
            4. letter spacing
            5. text color
            6. text size
            7. justify
            8. hyphenate
            9. line height
            10. what else? What is missing? 
6. Bug: Keyboard always shows when returning to app. 
7. Bug: Keyboard not opening when editing hex in color pallet. 
8. Cursor seems slow to respond vs obsidian 
9. Delete or edit image: 
    1. in WYSIWYG without having to select all the code — tap image shows a trash can and an edit pencil. 
        1. Trash can deletes image 
        2. Pencil opes dialogue with image properties: url, size, what else? 
    2. Protect image from accidental deletion. 
10. Font: 
    1. make sure fonts are not double loaded. 
    2. Make sure there is an option to choose from available fonts on the phone when selecting font. 
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