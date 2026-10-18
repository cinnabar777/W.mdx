# Typography

# HEADINGS

1. Heading size scale: fixed 
2. Heading font weight: fixed 
3. Heading font file: NOT working 
4. Heading text alignment: fixed 
5. Heading line height: fixed 
6. Heading letter spacing: fixed 
7. Heading text transform: fixed 
8. Underline style: NOT working, tested all. 
9. Underline thickness: dependent 
10. Underline color: dependent 
11. Top margin: fixed 
12. Bottom margin: fixed 


All heading settings need to be individualized for each heading, not just global. A color added to the global headings and a other settings added to each header. Therefore a user can set global setting but override them for one or two headings. 

---------------

# PARAGRAPH & BODY TYPOGRAPHY

1. Body text size: works but affects all text including headings.
2. Paragraph line height: fixed. Affects all but headings. Should affect only normal paragraphs. 
3. Global letter spacing: fixed, should say paragraph not global. Should affect only normal paragraphs not everything. 
4. Body paragraph font: fixed. Seems to affect all. 
5. Paragraph text alignment: fixed, but affects all but headers. Should only affect normal paragraphs. 
6. First line indent: fixed. 
7. Justify paragraph text only: fixed. 
8. Top margin: fixed, but affects other items than just normal paragraphs. 
9. Bottom margin: fixed, but affects other items than just normal paragraphs. 
10. Enable line wrap: not working but toolbar key to toggle line wrap is working.

----------
# INLINE FORMATS

1. Bold text color: fixed. 
2. Bold font weight: fixed. 
3. Bold text font file: NOT working. 
4. Italic text color: fixed 
5. Italic font weight: fixed 
6. Italic text font file: NOT working. 
7. Hyperlink color: fixed 
8. Hyperlinks link decoration: NOT working. 
9. Footnote font size: NOT working.
10. Footnote text color: NOT working.
11. Footnote reference color: NOT working.
12. Footnote back link color: NOT working.
13. Footnote section background: NOT working.
14. Inline code text: fixed 
15. Inline code background color: fixed 
16. Inline code padding: fixed 
17. Inline code boarder radius: fixed 
18. Code font file: fixed 

**footnotes: each setting does not have a reset icon. I think that footnotes are not really functioning properly, probably need a plugin.**

-------------------

# LISTS

1. List left indent: NOT working. Tested highest and lowest. 
2. List item vertical spacing: NOT working. Tested highest and lowest. 
3. List line height: NOT working. tested 7
4. Bullet list marker color: NOT working.
5. Number list marker color: NOT working.
6. Unchecked box boarder color: NOT working.
7. Check box accent color: NOT working.

Checkbox need a background color for unchecked. Currently white in dark theme.

Lists do not behave correctly — add list to paragraph and only first line indents. 

-------------

# BLOCK QUOTES

1. Boarder thickness: fixed. 
2. Border style: fixed 
3. Border color: fixed 
4. Text color: NOT working.
5. Left margin: fixed 
6. Inside padding: fixed 

Callouts skipped: as far as I can see are not functional yet — no toolbar key, no shortcut setting.

-----------
# TABLES

1. Table boarder style: NOT working.
2. Table boarder thickness: NOT working. tested 6, 10.
3. Table boarder color: fixed. 
4. Header row background: fixed 
5. Header text color: NOT working.
6. Header text font weight: NOT working.
7. Cell background color: NOT working.
8. Cell text color: NOT working.
9. Cell padding: NOT working. tested 3, 20.

# CODEBLOCK STYLING

1. Text color: NOT working.
2. Background color: NOT working.
3. Padding: NOT working. 30 tested 
4. Border radius: NOT working. Tested 16
5. Line height: NOT working. tested 7
6. Language label text color: fixed 

Bug with the language and copy label: does not appear until cursor is in the codeblock itself.

Language and copy label need styling added to typography: background color, text color, copy background and text, boarder colors, etc.

-----------

# HORIZONTAL DIVIDERS

1. Line thickness: fixed. 
2. Line style: fixed. 
3. Line color: fixed. 
4. Line width: fixed — needs to be centered or a offset. 
5. Top margin: fixed. 
6. Bottom margin: fixed. 

------------------

# bottom control bar 

All work. 

-------

# BUGS

1. Undo deletes all: when the undo key is used when there is nothing to undo it deletes everything.
2. Bottom control/toolbar toggle not working. 
3. Text selection does not function properly. Was fixed in this branch I think: https://github.com/cinnabar777/ckeditor5/tree/Wmd-V0.2-13424438593115341489-8007187214692561893
4. Text navigation: jumps over elements when using a keyboard navigation. Fixed in a same branch above. 
