import { Router } from 'express'
import { getTeamMembers } from '../controllers/team.controller'
import { auth } from '../middleware/auth'

const router = Router()

// accessible to all roles but returns scoped data
router.get('/', auth(['admin', 'leader', 'telecaller']), getTeamMembers)

export default router