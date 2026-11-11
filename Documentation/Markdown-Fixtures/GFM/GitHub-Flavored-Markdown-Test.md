> Based on [github-flavored-markdown-test](https://github.com/suan/github-flavored-markdown-test) project!

[Emoji](https://www.webpagefx.com/tools/emoji-cheat-sheet/) is justice: :yum: :joy: :speech_balloon: :envelope: :fried_shrimp:

# H1
followed by some text

## H2
followed by some text

### H3
followed by some text

#### H4
followed by some text

##### H5
followed by some text

###### H6
followed by some text

Auto-detected link: http://www.france.com

Some Ignored_multiple_underscore_italics here

A line of normal text with `inline code` and *italics*, **strong font**, and even some μ†ℱ ╋ℯ╳╋. Followed by lots of Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis id sem purus, eu commodo tortor. Donec malesuada ultricies dolor a eleifend. In hac habitasse platea dictumst. Vivamus a faucibus ligula. Nullam molestie tristique arcu, eu elementum metus ultricies sed. Aenean luctus congue lectus, vitae semper erat rhoncus non. Nulla facilisi.

Followed by another line of normal text with `inline code` and *italics*, **strong font**, and even some μ†ℱ ╋ℯ╳╋. Followed by lots of Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis id sem purus, eu commodo tortor. Donec malesuada ultricies dolor a eleifend. In hac habitasse platea dictumst. Vivamus a faucibus ligula. Nullam molestie tristique arcu, eu elementum metus ultricies sed. Aenean luctus congue lectus, vitae semper erat rhoncus non. Nulla facilisi.

```中文测试```：西雅图（英语：Seattle）华文早期或译作~~舍路~~，是美国华盛顿州的一座**港口城市**，位于华盛顿州金郡，普吉特海湾和华盛顿湖之间，距离美加边境约174千米，是该州最大的城市，也是美国太平洋西北区最大的城市。在2013年截止2012年，全市人口约634,535人，都会区人口400万左右，为美国第15大都会区。西雅图也是景郡的郡政府所在地。早在欧洲人在此建立定居点至少4000年前，西雅图即有美洲原住民在此居住。1851年11月13日，阿瑟·阿姆斯特朗·丹尼（Arthur A. Denny）及其探险队抵达现今西雅图地区的阿尔凯角（Alki Point）并建立了第一个定居点，这个定居点于1853年被迁移到现在的位置并被命名为“西雅图”（得名于西雅图酋长）。伐木业是西雅图第一个主要产业，但在19世纪后期的克朗代克淘金热中，该市成为位于通往阿拉斯加途中的一个商业和造船业中心。到1910年，西雅图已成为美国25大城市之一。但在大萧条时期，其经济发展受到严重影响，于第二次世界大战期间及以后逐渐恢复，这部分得益于当地的波音公司将其制造中心定于此地。到上世纪80年代，西雅图发展为一个科技中心，软件，生物技术和互联网公司的发展使该市经济得以复兴，人口也在10年间增加了超过50000人。最近西雅图又成为一个绿色工业和可持续发展模式的中心，并在2013年7月被认为是美国发展速度最快的主要城市。西雅图的官方别名为“翡翠之城（the Emerald City）”，其他别名还有“雨城（the Rainy City）”、“常绿之城（Evergreen City）”、“阿拉斯加门户（_the Gateway to Alaska_）”、“女王之城（*Queen City*）”和“喷气机之城（Jet City）”。西雅图也是摇滚音乐家吉米·亨德里克斯的出生地，也被认为是是另类摇滚风格垃圾音乐的诞生之地]。其咖啡消费量极大，是“星巴克”诞生之地，第一家门店就在此地。

~~Thin horizontal rule~~:

--

Thick horizontal rule:

------

Multi-paragraph list:

*   This is a list item with two paragraphs. Lorem ipsum dolor
    sit amet, consectetuer adipiscing elit. Aliquam hendrerit
    mi posuere lectus.

    Vestibulum enim wisi, viverra nec, fringilla in, laoreet
    vitae, risus. Donec sit amet nisl. Aliquam semper ipsum
    sit amet velit.

*   Suspendisse id sem consectetuer libero luctus adipiscing.

Ordered list:

1. list item 1
2. list item 2
3. list item 3

Unordered list:

* list item 1
* list item 2
* list item 3

Complex list:

* Item 1
    1. Hello
    2. World
* Item 2
    - Subitem A
    - Subitem B following:
        + What
        + The
        + Code
* Item 3 - yes! just a single item


Test Check list:    


* [ ] Check Item 1
* [ ] Check Item 2
* [ ] Check Item 3 and:
    - [ ] Check Item A
    - [ ] Check Item B
    - [ ] Check Item C


|Table Header 1|Table Header 2           |
|--------------|-------------------------|
|Content       |http://example.org       |
|Content       |http://localhost:\<port\>|
Text right below table. 

| Header 1 | Header 2 | Header 3  |
|:---------|:--------:|----------:|
| Left     | Center   | Right     |
| 左对齐 | 居中 | 右对齐 |
| `hello` | *world* | **+1** |

|Table Header 1|Table Header 2|
|--------------|--------------|
|Content  |          |
|内容       | 內容產業 |
| コンテンツ産業 | 컴퓨터 |
| Hebrew | אָלֶף־בֵּית עִבְרִי |
| Arabic | الأبجديات المشتقة من |

Empty line between table and this text

    def this_is
      puts "some #{4-space-indent} code"
    end

<pre><code>
def this_is
  puts "some #{code tag} code"
end
</code></pre>

<pre>
def this_is
  puts "some #{pre tag} code"
end
</pre>

```
def this_is
  puts "some #{fenced} code"
end
```

```ruby
class Classy
  def this_is
    puts "some #{colored} ruby code with ruby syntax highlighting"
    @someobj.do_it(1, 2)
  end
end
```

```javascript
var test = function this_is(){
  console.log("some" + colored + "javascript code with javascript syntax highlighting really long");
}
```

```clojure
(defproject myproject "0.5.0-SNAPSHOT"
  :description "Some clojure code with syntax highlighting."
  :dependencies [[org.clojure/clojure "1.5.1"]]
  :plugins [[lein-tar "3.2.0"]])
```

```js
var test = function this_is(){
  console.log("language declared as 'js' instead");
}
```

```bogus_language
var test = function this_is(){
  console.log("language declared as bogus_language");
}
```

> here is blockquote    
> ex.    
> Stories are just data with a soul.    
>     --- Dr. Brené Brown

![Relative image link](https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png "Google Logo")

## Packaged offline attachment fixtures

The external image above remains an online-resource test; these local fixtures make the image and attachment checks reproducible inside the MDZip package without network access.

![Packaged local image](assets/offline-markdown-test.png)

[PDF attachment](attachments/portable-document.pdf) · [ZIP attachment](attachments/portable-data.zip)

<audio controls src="assets/portable-audio.wav"></audio>

<video controls src="assets/portable-video.mp4"></video>
