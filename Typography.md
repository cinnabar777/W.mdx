# Typography

# HEADINGS

All heading settings need to be individualized for each heading, not just global. A color added to the global headings and a other settings added to each header. Therefore a user can set global setting but override them for one or two headings. 

---------------

# PARAGRAPH & BODY TYPOGRAPHY

1. Body text size: works but affects all text **except** headings.
2. Global letter spacing: fixed, should say paragraph not global. **Affects list** items still. 
3. Body paragraph font: fixed. **Affects lists**. 
4. Top margin: fixed, **affects lists**. 

----------
# INLINE FORMATS

1. Hyperlinks link decoration: **NOT** working. Links are formatted now — there needs to be a popup when adding links in WYSIWYG view because the code stays hidden thus can't really enter a url. 
2. Footnote font size: NOT working.
3. Footnote text color: NOT working.
4. Footnote reference color: NOT working.
5. Footnote back link color: NOT working.
6. Footnote section background: NOT working.

**footnotes: each setting does not have a reset icon. I think that footnotes are not really functioning properly, probably need a plugin.**

-------------------

# LISTS

Checkbox: need a background color for unchecked, option to hide the bullet in front of a box or proper syntax ` [ ] `, option to color the check mark. 

List now indents whole paragraph but the first line is indebted further, remaining lines are flush with bullet. 

Lists bullets are now styled. 

-------------

# BLOCK QUOTES

Callouts skipped: as far as I can see are not functional yet — no toolbar key, no shortcut setting.

-----------
# TABLES

1. Table boarder style: 
2. Table boarder thickness: 
3. Table boarder color: 
4. Header row background: 
5. Header text color: 
6. Header text font weight: 
7. Cell background color: 
8. Cell text color: 
9. Cell padding: 

# CODEBLOCK STYLING

**codeblock needs text background color added**

Bug with the language and copy label: does not appear until cursor is in the codeblock itself.

Language and copy label need styling added to typography: background color, text color, copy background and text colors, boarder colors, etc. Not working at all now. 

-----------

# HORIZONTAL DIVIDERS

1. Line width: fixed — **needs to be centered or a offset**. 

------------------

# bottom control bar 

All work. 

-------

# BUGS & ISSUES 

1. Bottom control/toolbar toggle needs color settings for toggle. 
2. **Text selection** does not function properly. Was fixed in this branch I think: https://github.com/cinnabar777/ckeditor5/tree/Wmd-V0.2-13424438593115341489-8007187214692561893 — not working 
3. **Text navigation**: jumps over elements when using a keyboard navigation. Fixed in a same branch above. Not working 
4. **Reset icon**: several settings are missing it. We have two sizes — a large one Replit did and the small one Jules did — halfway between the two sizes would be best. Placement: many are placed poorly, all need to be at the far end, and that space should be saved for the reset icon so settings are not resizing when the reset icon appears. Not fixed. 
