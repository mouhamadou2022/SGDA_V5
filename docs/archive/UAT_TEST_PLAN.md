# SGDA V8 UAT Test Plan
**Phase 5: User Acceptance Testing**
**Version 1.0**
**Date: April 24, 2026**

---

## Executive Summary

This document outlines the comprehensive User Acceptance Testing (UAT) plan for SGDA V8 Phase 5. The UAT will involve stakeholders from ANACIM, airport operators, and inspection teams to validate system functionality, usability, and compliance with business requirements.

**UAT Duration:** 4 weeks
**Target Audience:** ANACIM staff, airport operators, inspectors
**Success Criteria:** 95% test case pass rate

---

## 1. Test Objectives

### Primary Objectives
- Validate all 21 modules function correctly in production environment
- Verify data integrity and consistency across workflows
- Ensure compliance with CDC V8 specifications
- Confirm user acceptance of system design and functionality
- Identify and document any issues for remediation

### Secondary Objectives
- Gather user feedback for improvements
- Train operators and administrators on system usage
- Establish baseline performance metrics
- Validate disaster recovery procedures

---

## 2. Test Scope

### In Scope
| Component | Coverage |
|-----------|----------|
| Core Modules | All 21 modules |
| Workflows | Surveillance, Certification, Homologation, Écarts |
| User Roles | 7 roles (DG, Inspectors, Operators, Admin) |
| Data Operations | CRUD operations on all entities |
| Reporting | All chart types and export formats |
| Integrations | Supabase backend, Auth, Storage |
| Security | RBAC, encryption, audit logging |

### Out of Scope
- Code-level performance optimization
- Infrastructure load testing
- Third-party integrations (legacy systems)
- Mobile app (Phase 6+)

---

## 3. UAT Test Cases

### 3.1 Surveillance Workflow (7 Test Cases)
```
TC-SUR-001: Create surveillance planning
- Create new surveillance for aerodrome
- Verify planning appears in dashboard
- Expected: Planning created with status PLANNED

TC-SUR-002: Assign inspectors
- Assign inspectors with workload distribution
- Verify assignments appear in planning
- Expected: Inspectors assigned, no overload

TC-SUR-003: Complete checklist
- Access inspection checklist
- Mark items complete
- Expected: Checklist updates in real-time

TC-SUR-004: Identify écarts
- Document non-conformities during inspection
- Assign severity levels
- Expected: Écarts created with details

TC-SUR-005: Generate rapport
- Create inspection report
- Verify findings accuracy
- Expected: Rapport generated, exportable

TC-SUR-006: Prepare lettre
- Draft transmission letter
- Include corrective action deadlines
- Expected: Letter formatted correctly

TC-SUR-007: Archive inspection
- Close surveillance and archive
- Verify data retained for audit
- Expected: Archived, no longer editable
```

### 3.2 Certification Workflow (5 Test Cases)
```
TC-CERT-001: Submit intent
- Aerodrome submits certification intent
- Verify DG receives notification
- Expected: Intent recorded, workflow initiated

TC-CERT-002: Submit formal request
- Aerodrome submits formal certification request
- Verify documentation completeness
- Expected: Request status updated

TC-CERT-003: On-site verification
- Inspector conducts verification
- Document findings
- Expected: Verification report created

TC-CERT-004: Issue certificate
- DG reviews and issues certificate
- Verify certificate signed and dated
- Expected: Certificate generated and distributed

TC-CERT-005: Publish certification
- Certificate published to registry
- Aerodrome receives confirmation
- Expected: Public availability verified
```

### 3.3 Homologation Workflow (3 Test Cases)
```
TC-HOLOG-001: Submit formal request
- Submit homologation request
- Verify compliance with national standards
- Expected: Request recorded

TC-HOLOG-002: Conduct verification
- Perform on-site verification
- Document compliance assessment
- Expected: Verification complete

TC-HOLOG-003: Issue decision
- DG makes approval/denial decision
- Notify aerodrome
- Expected: Decision recorded and communicated
```

### 3.4 Écarts & PAC Workflow (4 Test Cases)
```
TC-ECART-001: Create écart
- Document non-conformity
- Assign severity and category
- Expected: Écart created with tracking

TC-ECART-002: PAC submission
- Create plan of corrective action
- Include timeline and responsible parties
- Expected: PAC registered in system

TC-ECART-003: Proof submission
- Submit evidence of correction
- Attach documentation
- Expected: Proof recorded with timestamp

TC-ECART-004: Verify closure
- Verify correction effectiveness
- Close écart if acceptable
- Expected: Écart closed with audit trail
```

### 3.5 Core Functionality (8 Test Cases)
```
TC-CORE-001: User login
- Login with valid credentials
- Verify dashboard loads
- Expected: User authenticated, role applied

TC-CORE-002: RBAC enforcement
- Attempt access to restricted modules
- Verify denial based on role
- Expected: Access denied with message

TC-CORE-003: Module navigation
- Switch between modules
- Verify state preservation
- Expected: Smooth navigation, state intact

TC-CORE-004: Data persistence
- Create data offline
- Reconnect to network
- Expected: Data synced to server

TC-CORE-005: Real-time updates
- Multiple users edit same record
- Verify all clients update
- Expected: Real-time sync working

TC-CORE-006: File upload
- Upload document to dossier
- Verify storage and retrieval
- Expected: File accessible and versioned

TC-CORE-007: Report generation
- Generate PDF report
- Verify formatting and data
- Expected: Report complete and downloadable

TC-CORE-008: Audit logging
- Perform action
- Check audit log
- Expected: Action recorded with timestamp and user
```

### 3.6 Data Validation (4 Test Cases)
```
TC-DATA-001: Required fields
- Attempt submit with missing fields
- Expected: Validation error

TC-DATA-002: Data format validation
- Enter invalid date format
- Expected: Format error, correction suggested

TC-DATA-003: Duplicate detection
- Attempt create duplicate aerodrome
- Expected: Duplicate warning

TC-DATA-004: Referential integrity
- Attempt delete aerodrome with inspections
- Expected: Prevent deletion, show dependencies
```

### 3.7 Performance (3 Test Cases)
```
TC-PERF-001: Dashboard load time
- Measure time to dashboard display
- Expected: < 2 seconds

TC-PERF-002: Module load time
- Measure time to module display
- Expected: < 1 second

TC-PERF-003: Search performance
- Search large dataset
- Expected: Results in < 500ms
```

---

## 4. Test Environment

### Hardware Configuration
- **Servers:** Supabase production instance
- **Client Devices:** 
  - Windows 11 desktop (1920x1080)
  - MacBook Pro (2560x1600)
  - iPad (1024x768)
  - iPhone 14 (375x667) - responsive view

### Browser Compatibility
- Chrome 125+
- Firefox 125+
- Safari 17+
- Edge 125+

### Network Conditions
- Production internet (broadband, 100+ Mbps)
- Simulated poor connection (3G)
- Offline mode testing

---

## 5. Test Execution Schedule

### Week 1: Core Functionality
| Day | Focus | Lead |
|-----|-------|------|
| Mon-Tue | Setup, RBAC, Auth | QA Team |
| Wed-Thu | Module navigation, data ops | QA Team |
| Fri | Data validation | QA Team |

### Week 2: Surveillance Workflow
| Day | Focus | Lead |
|-----|-------|------|
| Mon-Wed | Planning, assignment, checklist | Inspectors |
| Thu-Fri | Écarts, rapport, lettre | Inspectors |

### Week 3: Certification & Homologation
| Day | Focus | Lead |
|-----|-------|------|
| Mon-Tue | Certification workflow | DG/Inspectors |
| Wed-Fri | Homologation workflow | DG/Inspectors |

### Week 4: Integration, Performance, Closure
| Day | Focus | Lead |
|-----|-------|------|
| Mon-Tue | End-to-end scenarios | All teams |
| Wed | Performance testing | QA Team |
| Thu | Issue resolution | Dev Team |
| Fri | Sign-off & closure | Project Manager |

---

## 6. Defect Management

### Severity Levels
| Level | Definition | Example | SLA |
|-------|-----------|---------|-----|
| Critical | System unusable, data loss | Cannot login | 24h |
| High | Major feature broken | Workflow doesn't progress | 48h |
| Medium | Feature partially works | Export format incorrect | 72h |
| Low | Minor cosmetic issue | Button text misaligned | 1 week |

### Defect Log Template
```
ID: DEF-001
Title: Module not loading
Severity: High
Description: Certification module shows blank screen
Steps: 1. Login as DG 2. Click Certification
Expected: Module displays with data
Actual: Blank white screen with no error
Assigned: Dev Team
Status: Open
```

---

## 7. Test Success Criteria

### Quantitative Criteria
- ✅ Pass rate ≥ 95% (≤ 4 failures of 80 test cases)
- ✅ Critical/High defects resolved
- ✅ Performance targets met (< 2s load)
- ✅ Data integrity verified

### Qualitative Criteria
- ✅ User feedback positive
- ✅ No confusing workflows
- ✅ Documentation sufficient
- ✅ Training materials adequate

---

## 8. Sign-Off Requirements

### Before Production Deployment
- [ ] All test cases executed
- [ ] Pass rate ≥ 95%
- [ ] Critical defects resolved
- [ ] Performance validated
- [ ] Security audit passed
- [ ] Backup/recovery tested
- [ ] User training completed
- [ ] Documentation finalized

### Stakeholder Sign-Off
- [ ] DG ANACIM approval
- [ ] IT Director approval
- [ ] Airport Operators representative
- [ ] Inspection Team lead

---

## 9. Post-UAT Activities

### Week 1 Post-UAT
- Finalize issue resolution
- Update documentation
- Conduct production planning

### Week 2 Post-UAT
- Prepare production environment
- Conduct data migration testing
- Execute go-live checklist

### Week 3 Post-UAT
- Perform production go-live
- Monitor system 24/7
- Support user questions

---

## 10. Appendices

### A. Test Data Sets
- 50 test aerodromes (various categories)
- 100 test users (various roles)
- 200 historical inspections
- 500 sample écarts

### B. User Roles for Testing
- **dg_anacim**: DG (all access)
- **inspector_regional**: Regional inspector
- **inspector_national**: National inspector
- **dg_operator**: Airport operator DG
- **focal_operator**: Focal contact
- **admin**: System administrator

### C. Reporting Requirements
- Daily test execution report
- Weekly defect summary
- Final UAT sign-off report
- Lessons learned document

---

## 11. Contact Information

| Role | Name | Contact |
|------|------|---------|
| UAT Manager | TBD | uat@anacim.sn |
| Project Manager | TBD | pm@anacim.sn |
| QA Lead | TBD | qa@anacim.sn |
| Dev Lead | TBD | dev@anacim.sn |
| Ops Manager | TBD | ops@anacim.sn |

---

## Sign-Off

**Prepared by:** SGDA Development Team
**Date:** April 24, 2026
**Status:** Ready for UAT

---

*This UAT Test Plan is subject to change based on stakeholder feedback and project needs.*
