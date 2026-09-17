import cds from '@sap/cds'
import { describe, it, before } from 'node:test'
import path from 'node:path'

// Tests act as the mocked users alice and bob, whatever the local dev auth is
process.env.cds_requires_auth_kind = 'mocked'

const { GET, POST, PATCH, DEL, expect } = cds.test(path.join(import.meta.dirname, '..'))

const SVC = '/odata/v4/site-visit'
// Fiori Elements sends If-Match on every change to an entity with an ETag
const ALICE = { auth: { username: 'alice', password: '' }, headers: { 'If-Match': '*' } }
const BOB = { auth: { username: 'bob', password: '' }, headers: { 'If-Match': '*' } }

const isoDay = offsetDays => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10)
const TODAY = isoDay(0), FUTURE = isoDay(30), PAST = isoDay(-1)

const active = ID => `${SVC}/SiteVisit(ID=${ID},IsActiveEntity=true)`
const draft = ID => `${SVC}/SiteVisit(ID=${ID},IsActiveEntity=false)`

// Every visit a test touches is tracked and removed again by the last test
const created = new Set()

/** Returns the error of a failed request (or throws if it unexpectedly succeeded). */
async function failure(promise) {
  try { await promise } catch (e) { return e.response }
  throw new Error('request was expected to fail')
}
/** All messages of an OData error response, flattened to { message, target }. */
const messagesOf = res => {
  const { error } = res.data
  return [error, ...(error.details ?? [])].map(({ message, target }) => ({ message, target }))
}

async function newDraft(data = {}, user = ALICE) {
  const { data: d } = await POST(`${SVC}/SiteVisit`, {}, user)
  created.add(d.ID)
  if (Object.keys(data).length) await PATCH(draft(d.ID), data, user)
  return d
}
const activate = (ID, user = ALICE) => POST(`${draft(ID)}/SiteVisitService.draftActivate`, {}, user)
const edit = (ID, user = ALICE, headers) =>
  POST(`${active(ID)}/SiteVisitService.draftEdit`, { PreserveChanges: true }, { ...user, headers: { ...user.headers, ...headers } })

async function savedVisit(data, user = ALICE) {
  const { ID } = await newDraft(data, user)
  const { data: saved } = await activate(ID, user)
  return saved
}

const validVisit = () => ({
  customerName: 'SAPSA Test Customer', country_code: 'SE', visitDate: FUTURE, purpose: 'Test visit', notes: 'Line 1\nLine 2'
})

describe('Service (Definition of Done #4)', () => {
  it('$metadata returns 200 with SiteVisit and Country sets and UI annotations', async () => {
    const { status, data } = await GET(`${SVC}/$metadata`, ALICE)
    expect(status).to.equal(200)
    expect(data).to.include('<EntitySet Name="SiteVisit"')
    expect(data).to.include('<EntitySet Name="Country"')
    for (const term of ['UI.LineItem', 'UI.SelectionFields', 'UI.Facets', 'UI.HeaderInfo', 'UI.PresentationVariant'])
      expect(data).to.include(`Term="${term}"`)
  })

  it('GET on each entity set returns 200', async () => {
    for (const set of ['SiteVisit', 'Country', 'VisitStatus'])
      expect((await GET(`${SVC}/${set}`, ALICE)).status).to.equal(200)
  })

  it('rejects anonymous access', async () => {
    expect((await failure(GET(`${SVC}/SiteVisit`))).status).to.equal(401)
  })
})

describe('SAPSA-2 Log a new site visit', () => {
  it('Create is possible (entity set is insertable and draft-enabled)', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    expect(data).to.match(/Target="SiteVisitService.EntityContainer\/SiteVisit"[\s\S]*?Term="Common.DraftRoot"/)
    const { data: d } = await POST(`${SVC}/SiteVisit`, {}, ALICE)
    created.add(d.ID)
    expect(d.IsActiveEntity).to.equal(false)
  })

  it('Customer name, Country and Visit date are mandatory — a message on each, nothing saved', async () => {
    const { ID } = await newDraft({ purpose: 'missing mandatory fields' })
    const res = await failure(activate(ID))
    expect(res.status).to.equal(400)
    const targets = messagesOf(res).map(m => m.target)
    expect(targets).to.include.members(['in/customerName', 'in/country_code', 'in/visitDate'])
    expect((await failure(GET(active(ID), ALICE))).status).to.equal(404)
  })

  it('mandatory fields are flagged in the UI', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    for (const field of ['customerName', 'country_code', 'visitDate'])
      expect(data).to.match(new RegExp(`Target="SiteVisitService.SiteVisit/${field}"[\\s\\S]*?Common.FieldControl" EnumMember="Common.FieldControlType/Mandatory"`))
  })

  it('Purpose and Notes are optional', async () => {
    const { purpose, notes, ...required } = validVisit()
    const saved = await savedVisit(required)
    expect(saved.IsActiveEntity).to.equal(true)
    expect(saved.purpose).to.equal(null)
    expect(saved.notes).to.equal(null)
  })

  it('Visit ID is assigned by the system and read-only', async () => {
    const { data: d } = await POST(`${SVC}/SiteVisit`, {}, ALICE)
    created.add(d.ID)
    expect(d.ID).to.match(/^[0-9a-f-]{36}$/)
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    expect(data).to.match(/Target="SiteVisitService.SiteVisit\/ID"[\s\S]*?Term="Core.Computed"/)
  })

  it('a saved visit reads back with exactly the values entered', async () => {
    const input = validVisit()
    const { ID } = await savedVisit(input)
    const { data } = await GET(active(ID), ALICE)
    expect(data).to.containSubset(input)
  })
})

describe('SAPSA-3 Pick the visit country from master data', () => {
  it('value help lists every country with code and name', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    expect(data).to.match(/Target="SiteVisitService.SiteVisit\/country_code"[\s\S]*?Term="Common.ValueList"[\s\S]*?CollectionPath" String="Country"/)
    const { Countries } = cds.entities('sap.common')
    const { count } = await SELECT.one`count(*) as count`.from(Countries)
    const { data: vh } = await GET(`${SVC}/Country?$select=code,name&$count=true&$top=1000`, ALICE)
    expect(vh['@odata.count']).to.equal(count).and.to.be.above(200)
    expect(vh.value.find(c => c.code === 'SE')).to.deep.include({ name: 'Sweden' })
  })

  it('country names are shown in the logon language', async () => {
    const { data } = await GET(`${SVC}/Country('DE')`, { ...ALICE, headers: { ...ALICE.headers, 'Accept-Language': 'de' } })
    expect(data.name).to.equal('Deutschland')
  })

  it('country name is shown next to the code', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    expect(data).to.match(/Target="SiteVisitService.SiteVisit\/country_code"[\s\S]*?Common.Text" Path="country\/name"/)
  })

  it('an unknown country code fails with a message on Country', async () => {
    const { ID } = await newDraft({ ...validVisit(), country_code: 'XX' })
    const res = await failure(activate(ID))
    expect(res.status).to.equal(400)
    expect(messagesOf(res).map(m => m.target)).to.include('in/country_code')
    expect((await failure(GET(active(ID), ALICE))).status).to.equal(404)
  })

  it('a visit reads together with its country via $expand', async () => {
    const { ID } = await savedVisit({ ...validVisit(), country_code: 'NO' })
    const { status, data } = await GET(`${active(ID)}?$expand=country`, ALICE)
    expect(status).to.equal(200)
    expect(data.country).to.deep.include({ code: 'NO', name: 'Norway' })
  })
})

describe('SAPSA-4 Reject invalid visit dates', () => {
  it('a new visit dated before today fails with a translatable message on Visit date; nothing saved', async () => {
    const { ID } = await newDraft({ ...validVisit(), visitDate: PAST })
    const res = await failure(activate(ID))
    expect(res.status).to.equal(400)
    expect(messagesOf(res)).to.deep.include({ target: 'in/visitDate', message: `The visit date must be today (${TODAY}) or later.` })
    expect((await failure(GET(active(ID), ALICE))).status).to.equal(404)

    const de = await failure(POST(`${draft(ID)}/SiteVisitService.draftActivate`, {}, { ...ALICE, headers: { ...ALICE.headers, 'Accept-Language': 'de' } }))
    expect(messagesOf(de).find(m => m.target === 'in/visitDate').message).to.equal(`Das Besuchsdatum muss heute (${TODAY}) oder später sein.`)
  })

  it('changing an existing visit to a past date fails and the saved date stays unchanged', async () => {
    const { ID } = await savedVisit(validVisit())
    await edit(ID)
    await PATCH(draft(ID), { visitDate: PAST }, ALICE)
    const res = await failure(activate(ID))
    expect(res.status).to.equal(400)
    expect(messagesOf(res).map(m => m.target)).to.include('in/visitDate')
    expect((await GET(active(ID), ALICE)).data.visitDate).to.equal(FUTURE)
  })

  it('an existing visit whose date has passed saves when the date is not changed', async () => {
    const { SiteVisits } = cds.entities('sapsa.sitevisit')
    const ID = cds.utils.uuid()
    created.add(ID)
    await INSERT.into(SiteVisits).entries({ ID, ...validVisit(), visitDate: PAST, status_code: 'OPEN' })
    await edit(ID)
    await PATCH(draft(ID), { status_code: 'COMPLETED' }, ALICE)
    const { status, data } = await activate(ID)
    expect(status).to.equal(200)
    expect(data).to.deep.include({ visitDate: PAST, status_code: 'COMPLETED' })
  })

  it('a visit dated today saves', async () => {
    const saved = await savedVisit({ ...validVisit(), visitDate: TODAY })
    expect(saved.visitDate).to.equal(TODAY)
  })
})

describe('SAPSA-5 Default a new visit\'s status to Open', () => {
  it('a new draft shows OPEN immediately and keeps it on save', async () => {
    const { ID, status_code } = await newDraft()
    expect(status_code).to.equal('OPEN')
    await PATCH(draft(ID), validVisit(), ALICE)
    expect((await activate(ID)).data.status_code).to.equal('OPEN')
  })

  it('a status picked before saving is kept', async () => {
    const saved = await savedVisit({ ...validVisit(), status_code: 'CANCELLED' })
    expect(saved.status_code).to.equal('CANCELLED')
  })
})

describe('SAPSA-6 Edit an existing site visit as a draft', () => {
  it('Edit opens a draft where all business fields and any status can be changed; Save applies and removes the draft', async () => {
    const { ID } = await savedVisit(validVisit())
    const { data: d } = await edit(ID)
    expect(d.IsActiveEntity).to.equal(false)
    for (const status_code of ['COMPLETED', 'CANCELLED', 'OPEN'])
      await PATCH(draft(ID), { status_code }, ALICE)
    const changes = { customerName: 'Changed Customer', country_code: 'FI', visitDate: isoDay(60), purpose: 'Changed', notes: 'Changed notes', status_code: 'COMPLETED' }
    await PATCH(draft(ID), changes, ALICE)
    const { data } = await activate(ID)
    expect(data).to.containSubset(changes)
    expect((await failure(GET(draft(ID), ALICE))).status).to.equal(404)
  })

  it('system fields are read-only', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    for (const field of ['createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'])
      expect(data).to.match(new RegExp(`Target="SiteVisitService.SiteVisit/${field}"[\\s\\S]*?Term="Core.Computed"`))
  })

  it('an unknown status is rejected on save', async () => {
    const { ID } = await savedVisit(validVisit())
    await edit(ID)
    await PATCH(draft(ID), { status_code: 'POSTPONED' }, ALICE)
    const res = await failure(activate(ID))
    expect(messagesOf(res).map(m => m.target)).to.include('in/status_code')
  })

  it('while the draft is open, other users and the list see the saved values', async () => {
    const { ID } = await savedVisit(validVisit())
    await edit(ID)
    await PATCH(draft(ID), { customerName: 'Unsaved change' }, ALICE)
    expect((await GET(active(ID), BOB)).data.customerName).to.equal('SAPSA Test Customer')
    const { data: list } = await GET(`${SVC}/SiteVisit?$filter=IsActiveEntity eq true and ID eq ${ID}`, BOB)
    expect(list.value[0].customerName).to.equal('SAPSA Test Customer')
  })

  it('save runs the checks from SAPSA-2, -3 and -4', async () => {
    const { ID } = await savedVisit(validVisit())
    await edit(ID)
    for (const [change, target] of [
      [{ customerName: null }, 'in/customerName'], // SAPSA-2
      [{ country_code: 'XX' }, 'in/country_code'], // SAPSA-3
      [{ visitDate: PAST }, 'in/visitDate'] //        SAPSA-4
    ]) {
      await PATCH(draft(ID), change, ALICE)
      expect(messagesOf(await failure(activate(ID))).map(m => m.target)).to.include(target)
      await PATCH(draft(ID), { ...validVisit(), visitDate: FUTURE }, ALICE)
    }
    expect((await activate(ID)).status).to.equal(200)
  })

  it('Discard removes the draft and leaves the saved visit unchanged', async () => {
    const { ID } = await savedVisit(validVisit())
    await edit(ID)
    await PATCH(draft(ID), { customerName: 'To be discarded' }, ALICE)
    expect((await DEL(draft(ID), ALICE)).status).to.equal(204)
    expect((await failure(GET(draft(ID), ALICE))).status).to.equal(404)
    expect((await GET(active(ID), ALICE)).data.customerName).to.equal('SAPSA Test Customer')
  })

  it('a user returning later continues the draft with changes intact', async () => {
    const { ID } = await savedVisit(validVisit())
    await edit(ID)
    await PATCH(draft(ID), { notes: 'Half-finished notes' }, ALICE)
    const { data } = await GET(`${SVC}/SiteVisit?$filter=IsActiveEntity eq false and ID eq ${ID}`, ALICE)
    expect(data.value[0]).to.deep.include({ notes: 'Half-finished notes', HasActiveEntity: true })
    await PATCH(draft(ID), { purpose: 'Resumed' }, ALICE)
    expect((await activate(ID)).data).to.deep.include({ notes: 'Half-finished notes', purpose: 'Resumed' })
  })

  it('while user A has a draft, user B cannot edit and is told it is locked by A', async () => {
    const { ID } = await savedVisit(validVisit())
    await edit(ID, ALICE)
    const res = await failure(edit(ID, BOB))
    expect(res.status).to.equal(409)
    expect(res.data.error.message).to.equal('The entity is locked by user "alice"')
  })

  it('an edit based on an outdated copy is rejected', async () => {
    const { ID } = await savedVisit(validVisit())
    const { headers } = await GET(active(ID), ALICE)
    const staleETag = headers.etag
    expect(staleETag).to.be.a('string')

    await new Promise(r => setTimeout(r, 5)) // ensure a distinct modifiedAt
    await edit(ID, BOB)
    await PATCH(draft(ID), { purpose: 'Newer version' }, BOB)
    await activate(ID, BOB)

    const res = await failure(edit(ID, ALICE, { 'If-Match': staleETag }))
    expect(res.status).to.equal(412)
    expect((await GET(active(ID), ALICE)).data.purpose).to.equal('Newer version')
  })
})

describe('SAPSA-7 Delete a site visit', () => {
  it('delete is offered for saved visits', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    const container = data.match(/<Annotations Target="SiteVisitService.EntityContainer\/SiteVisit">([\s\S]*?)<\/Annotations>/)[1]
    expect(container).not.to.include('Deletable" Bool="false"')
  })

  for (const status_code of ['OPEN', 'COMPLETED', 'CANCELLED'])
    it(`a ${status_code} visit is deleted and then not found`, async () => {
      const { ID } = await savedVisit({ ...validVisit(), status_code })
      expect((await DEL(active(ID), ALICE)).status).to.equal(204)
      expect((await failure(GET(active(ID), ALICE))).status).to.equal(404)
      const { data } = await GET(`${SVC}/SiteVisit?$filter=IsActiveEntity eq true and ID eq ${ID}`, ALICE)
      expect(data.value).to.have.length(0)
    })

  it('a visit that another user has open as a draft cannot be deleted — locked message', async () => {
    const { ID } = await savedVisit(validVisit())
    await edit(ID, ALICE)
    const res = await failure(DEL(active(ID), BOB))
    expect(res.status).to.equal(403)
    expect(res.data.error.message).to.equal('The entity is locked by user "alice"')
    expect((await GET(active(ID), BOB)).status).to.equal(200)
  })
})

describe('SAPSA-8 Browse and filter site visits by status', () => {
  let ids
  before(async () => {
    ids = []
    for (const [status_code, days] of [['OPEN', 10], ['COMPLETED', 20], ['CANCELLED', 5]])
      ids.push((await savedVisit({ ...validVisit(), customerName: `SAPSA Filter ${status_code}`, status_code, visitDate: isoDay(days) })).ID)
  })

  it('list report columns: Customer name, Country (code and name), Visit date, Status, Purpose', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    const lineItem = data.match(/Term="UI.LineItem">([\s\S]*?)<\/Collection>/)[1]
    const paths = [...lineItem.matchAll(/PropertyPath="Value" Path="([^"]+)"|Value" Path="([^"]+)"/g)].map(m => m[1] ?? m[2])
    expect(paths).to.deep.equal(['customerName', 'country_code', 'visitDate', 'status_code', 'purpose'])
  })

  it('sorted by Visit date, newest first, by default', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    expect(data).to.match(/Term="UI.PresentationVariant">[\s\S]*?PropertyPath="Property" Path="visitDate"|Term="UI.PresentationVariant">[\s\S]*?Property" PropertyPath="visitDate"[\s\S]*?Descending" Bool="true"/)
  })

  it('Status filter is a dropdown with exactly OPEN, COMPLETED and CANCELLED', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    expect(data).to.match(/Target="SiteVisitService.SiteVisit\/status_code"[\s\S]*?Common.ValueListWithFixedValues" Bool="true"/)
    const { data: vh } = await GET(`${SVC}/VisitStatus`, ALICE)
    expect(vh.value.map(s => s.code).sort()).to.deep.equal(['CANCELLED', 'COMPLETED', 'OPEN'])
  })

  it('filtering by one or more statuses returns only matching visits', async () => {
    const idFilter = `ID in (${ids.join(',')})`
    const one = await GET(`${SVC}/SiteVisit?$filter=IsActiveEntity eq true and ${idFilter} and status_code eq 'OPEN'`, ALICE)
    expect(one.data.value.map(v => v.status_code)).to.deep.equal(['OPEN'])
    const two = await GET(`${SVC}/SiteVisit?$filter=IsActiveEntity eq true and ${idFilter} and (status_code eq 'OPEN' or status_code eq 'CANCELLED')&$orderby=visitDate desc`, ALICE)
    expect(two.data.value.map(v => v.status_code)).to.deep.equal(['OPEN', 'CANCELLED'])
  })

  it('filter bar offers Status, Country and Visit date', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    const fields = data.match(/Term="UI.SelectionFields">([\s\S]*?)<\/Collection>/)[1]
    expect([...fields.matchAll(/<PropertyPath>([^<]+)</g)].map(m => m[1])).to.deep.equal(['status_code', 'country_code', 'visitDate'])
  })

  it('object page shows all fields, Notes multi-line, and Created/Changed by/at', async () => {
    const { data } = await GET(`${SVC}/$metadata`, ALICE)
    expect(data).to.match(/Target="SiteVisitService.SiteVisit\/notes"[\s\S]*?UI.MultiLineText" Bool="true"/)
    const groups = [...data.matchAll(/Term="UI.FieldGroup" Qualifier="\w+">([\s\S]*?)<\/Annotation>/g)].map(m => m[1]).join('')
    for (const field of ['customerName', 'country_code', 'visitDate', 'status_code', 'purpose', 'notes', 'createdBy', 'createdAt', 'modifiedBy', 'modifiedAt'])
      expect(groups).to.include(`Path="${field}"`)
  })
})

describe('Test data cleanup', () => {
  it('removes every visit and draft the tests created', async () => {
    const { SiteVisit } = cds.entities('SiteVisitService')
    const ids = [...created]
    await DELETE.from(SiteVisit.drafts).where({ ID: { in: ids } })
    await DELETE.from(SiteVisit).where({ ID: { in: ids } })
    const { count } = await SELECT.one`count(*) as count`.from(SiteVisit).where({ ID: { in: ids } })
    expect(count).to.equal(0)
  })
})
