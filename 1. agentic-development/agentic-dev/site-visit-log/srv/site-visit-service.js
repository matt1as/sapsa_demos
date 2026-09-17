import cds from '@sap/cds'

/** Today's date as YYYY-MM-DD, in UTC ("today" per SAPSA-1). */
const todayUTC = () => new Date().toISOString().slice(0, 10)

export default class SiteVisitService extends cds.ApplicationService {
  init() {
    const { SiteVisit, Country, VisitStatus } = this.entities

    // SAPSA-5: default status on a new draft, so OPEN shows before the first save.
    this.before('NEW', SiteVisit.drafts, req => {
      req.data.status_code ??= 'OPEN'
    })

    // SAPSA-6: tell the user who holds the lock instead of a generic "draft exists".
    this.before('EDIT', SiteVisit, async req => {
      const { ID } = req.params.at(-1)
      const draft = await SELECT.one.from(SiteVisit.drafts).where({ ID })
        .columns(d => d.DraftAdministrativeData(a => a.InProcessByUser))
      const lockedBy = draft?.DraftAdministrativeData?.InProcessByUser
      if (lockedBy && lockedBy !== req.user.id)
        req.reject({ status: 409, message: 'DRAFT_LOCKED_BY_ANOTHER_USER', args: [lockedBy] })
    })

    // Checks on save — draft activation runs these CREATE/UPDATE handlers.
    this.before('CREATE', SiteVisit, async req => {
      await checkReferences(req, { Country, VisitStatus })
      const { visitDate } = req.data
      if (visitDate && visitDate < todayUTC()) rejectPastDate(req)
    })

    this.before('UPDATE', SiteVisit, async req => {
      await checkReferences(req, { Country, VisitStatus })
      const { visitDate } = req.data
      if (!visitDate || visitDate >= todayUTC()) return
      // SAPSA-4: only a *changed* date must not be in the past
      const saved = await SELECT.one.from(SiteVisit, req.params.at(-1)).columns('visitDate')
      if (saved?.visitDate !== visitDate) rejectPastDate(req)
    })

    return super.init()
  }
}

/** Messages raised during a draft action are addressed relative to its binding parameter. */
const targetOf = (req, element) => (req._?.event?.startsWith('draft') ? 'in/' : '') + element

/** SAPSA-3 / SAPSA-6: country and status must exist in their master data. */
async function checkReferences(req, { Country, VisitStatus }) {
  const { country_code, status_code } = req.data
  if (country_code && !(await SELECT.one.from(Country, country_code).columns('code')))
    req.error({ status: 400, message: 'ASSERT_TARGET', target: targetOf(req, 'country_code') })
  if (status_code && !(await SELECT.one.from(VisitStatus, status_code).columns('code')))
    req.error({ status: 400, message: 'ASSERT_TARGET', target: targetOf(req, 'status_code') })
}

function rejectPastDate(req) {
  req.error({ status: 400, message: 'VISIT_DATE_IN_PAST', target: targetOf(req, 'visitDate'), args: [todayUTC()] })
}
