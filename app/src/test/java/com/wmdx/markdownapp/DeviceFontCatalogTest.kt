package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Test

class DeviceFontCatalogTest {
    @Test
    fun parsesNamedFamiliesAndAliasesOnly() {
        val xml = """
            <familyset>
                <family name="sans-serif"><font>Roboto-Regular.ttf</font></family>
                <family lang="ja"><font>NotoSansCJK-Regular.ttc</font></family>
                <alias name="sans-serif-light" to="sans-serif" weight="300" />
            </familyset>
        """.trimIndent()

        assertEquals(
            listOf("sans-serif", "sans-serif-light"),
            DeviceFontCatalog.parseFamilyNames(xml)
        )
    }
}
