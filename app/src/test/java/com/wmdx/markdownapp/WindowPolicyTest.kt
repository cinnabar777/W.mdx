package com.wmdx.markdownapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WindowPolicyTest {
    @Test
    fun freshOpenWithStaleOrBlankRegistrySelectsIncomingUri() {
        val resolved = WindowPolicy.resolveDocumentUri(
            restoringActivity = false,
            hasRegisteredState = true,
            registeredUri = "content://com.wmdx/old_doc.md",
            incomingUri = "content://com.wmdx/new_doc.md"
        )
        assertEquals("content://com.wmdx/new_doc.md", resolved)
    }

    @Test
    fun activityRestorationWithRegisteredBlankStateStaysBlank() {
        val resolved = WindowPolicy.resolveDocumentUri(
            restoringActivity = true,
            hasRegisteredState = true,
            registeredUri = "",
            incomingUri = "content://com.wmdx/original.md"
        )
        assertEquals("", resolved)
    }

    @Test
    fun activityRestorationAfterSaveAsUsesRegisteredCurrentUri() {
        val resolved = WindowPolicy.resolveDocumentUri(
            restoringActivity = true,
            hasRegisteredState = true,
            registeredUri = "content://com.wmdx/saved_as.md",
            incomingUri = "content://com.wmdx/original.md"
        )
        assertEquals("content://com.wmdx/saved_as.md", resolved)
    }

    @Test
    fun noRegisteredStateSelectsIncomingUriOrNull() {
        val resolvedWithUri = WindowPolicy.resolveDocumentUri(
            restoringActivity = false,
            hasRegisteredState = false,
            registeredUri = null,
            incomingUri = "content://com.wmdx/doc.md"
        )
        assertEquals("content://com.wmdx/doc.md", resolvedWithUri)

        val resolvedNull = WindowPolicy.resolveDocumentUri(
            restoringActivity = false,
            hasRegisteredState = false,
            registeredUri = null,
            incomingUri = null
        )
        assertEquals(null, resolvedNull)
    }

    @Test
    fun windowPolicyMatchesSameNormalizedUriAndRejectsExcludedTask() {
        val uri = "content://com.wmdx/doc.md"

        // Matching URI in different task
        assertTrue(
            WindowPolicy.matches(
                launcherRequest = false,
                requestedUri = uri,
                launcherTask = false,
                currentUri = uri,
                taskId = 10,
                excludedTask = 20
            )
        )

        // Excluded current task does not match
        assertFalse(
            WindowPolicy.matches(
                launcherRequest = false,
                requestedUri = uri,
                launcherTask = false,
                currentUri = uri,
                taskId = 20,
                excludedTask = 20
            )
        )

        // Different URI does not match
        assertFalse(
            WindowPolicy.matches(
                launcherRequest = false,
                requestedUri = uri,
                launcherTask = false,
                currentUri = "content://com.wmdx/other.md",
                taskId = 10,
                excludedTask = 20
            )
        )
    }

    @Test
    fun windowPolicyMatchesDocumentsOpenInInactiveTabs() {
        val requestedUri = "content://com.wmdx/second.md"

        assertTrue(
            WindowPolicy.matches(
                launcherRequest = false,
                requestedUri = requestedUri,
                launcherTask = true,
                currentUri = "content://com.wmdx/first.md",
                taskId = 10,
                excludedTask = -1,
                openTabUris = setOf(requestedUri)
            )
        )

        assertFalse(
            WindowPolicy.matches(
                launcherRequest = false,
                requestedUri = requestedUri,
                launcherTask = true,
                currentUri = "content://com.wmdx/first.md",
                taskId = 10,
                excludedTask = 10,
                openTabUris = setOf(requestedUri)
            )
        )
    }

    @Test
    fun treeScopedAndDirectSafUrisMatchTheSameOpenTab() {
        val treeUri =
            "content://com.android.externalstorage.documents/tree/primary%3ADocuments/document/primary%3ADocuments%2Fnotes.md"
        val directUri =
            "content://com.android.externalstorage.documents/document/primary%3ADocuments%2Fnotes.md"
        val differentDocument =
            "content://com.android.externalstorage.documents/document/primary%3ADocuments%2Fother.md"

        assertTrue(WindowPolicy.sameDocumentUri(treeUri, directUri))
        assertTrue(
            WindowPolicy.matches(
                launcherRequest = false,
                requestedUri = directUri,
                launcherTask = true,
                currentUri = "content://com.android.externalstorage.documents/document/primary%3ADocuments%2Ffirst.md",
                taskId = 10,
                excludedTask = -1,
                openTabUris = setOf(treeUri)
            )
        )
        assertFalse(WindowPolicy.sameDocumentUri(treeUri, differentDocument))
        assertFalse(
            WindowPolicy.sameDocumentUri(
                "content://provider.example/files/one",
                "content://provider.example/files/two"
            )
        )
    }

    @Test
    fun fingerprintUriReturnsEightCharHashOrNone() {
        assertEquals("none", WindowPolicy.fingerprintUri(null))
        assertEquals("none", WindowPolicy.fingerprintUri(""))

        val fp1 = WindowPolicy.fingerprintUri("content://com.wmdx/file1.md")
        val fp2 = WindowPolicy.fingerprintUri("content://com.wmdx/file1.md")
        val fp3 = WindowPolicy.fingerprintUri("content://com.wmdx/file2.md")

        assertEquals(8, fp1.length)
        assertEquals(fp1, fp2)
        assertFalse(fp1 == fp3)
    }
}
