/// <reference path="../pb_data/types.d.ts" />

routerAdd('POST', '/api/signup', (e) => {
    const data = e.requestInfo().body

    const email = data.email?.trim()
    const password = data.password
    const orgName = data.orgName?.trim()
    const orgSlug = data.orgSlug?.trim()

    if (!email || !password || !orgName || !orgSlug) {
        return e.badRequestError('All fields are required', null)
    }

    if (password.length < 8) {
        return e.badRequestError('Password must be at least 8 characters', null)
    }

    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    if (!slugPattern.test(orgSlug) || orgSlug.length < 3 || orgSlug.length > 15) {
        return e.badRequestError(
            'Slug must be 3-15 characters, lowercase letters, numbers, and hyphens only',
            null,
        )
    }

    // Check slug uniqueness
    try {
        $app.findFirstRecordByData('orgs', 'slug', orgSlug)
        return e.badRequestError('An organization with this slug already exists', null)
    } catch (_) {
        // Not found — good
    }

    let user
    try {
        const usersCollection = $app.findCollectionByNameOrId('users')
        user = new Record(usersCollection)
        user.set('email', email)
        user.set('password', password)
        user.set('name', email.split('@')[0])
        $app.save(user)
    } catch (err) {
        return e.badRequestError('Failed to create account: ' + err.message, null)
    }

    let org
    try {
        const orgsCollection = $app.findCollectionByNameOrId('orgs')
        org = new Record(orgsCollection)
        org.set('name', orgName)
        org.set('slug', orgSlug)
        $app.save(org)
    } catch (err) {
        // Clean up user on failure
        try {
            $app.delete(user)
        } catch (_) {}
        return e.badRequestError('Failed to create organization: ' + err.message, null)
    }

    try {
        const userOrgCollection = $app.findCollectionByNameOrId('user_org')
        const userOrg = new Record(userOrgCollection)
        userOrg.set('user', user.id)
        userOrg.set('org', org.id)
        userOrg.set('role', 'admin')
        $app.save(userOrg)
    } catch (err) {
        // Clean up on failure
        try {
            $app.delete(org)
        } catch (_) {}
        try {
            $app.delete(user)
        } catch (_) {}
        return e.badRequestError('Failed to link user to organization: ' + err.message, null)
    }

    return e.json(200, {
        userId: user.id,
        orgSlug: orgSlug,
    })
})
