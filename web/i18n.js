/* rtgap i18n: UI strings and renderers for engine message codes (el / en). */
(function (root) {
  'use strict';
  const RT = root.RT;
  const WDN = { en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], el: ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'] };
  const WD2 = { en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], el: ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'] };
  const MON = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    el: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'] };

  const S = {
    en: {
      tagline: 'Compensation of unscheduled radiotherapy interruptions',
      sub: 'Linear-quadratic model · RCR decision order · every rule with its source',
      lang_label: 'Language', case: 'Case', result: 'Result', refs: 'References', tools: 'Calculators',
      examples: 'Load an example', ex_pick: 'Example cases…', reset: 'New case',
      s_site: 'Tumour site', s_site_hint: 'Sets the RCR category, the prolongation allowance and default parameters. Everything can be edited below.',
      cat: 'Category', cat_auto: 'from site', cat1: '1 · radical, fast-growing', cat2: '2 · radical, slower', cat3: '3 · palliative', cat_none: 'none',
      allowance: 'Prolongation allowance', ideal: 'ideal', max: 'max', days: 'd', ott_cap: 'Overall time cap', no_accel: 'No accelerated scheduling',
      s_rx: 'Prescription', start: 'First fraction', fractions: 'Fractions', dpf: 'Dose per fraction (Gy)', total: 'Total',
      levels_mode: 'Several dose levels or phases (SIB, sequential boost)', phase: 'Phase', phase_name: 'Name', add_phase: 'Add phase', add_level: 'Add level', level: 'Level', remove: 'Remove',
      primary: 'Primary level (drives the decision)', treat_days: 'Treatment days', gr_holidays: 'Greek public holidays are non-treatment days',
      s_gap: 'Interruption', gap_hint: 'Tap the days on the calendar. The mode decides what a tap marks.',
      m_missed: 'Missed', m_unavail: 'Linac unavailable', m_chemo: 'Chemotherapy', m_closed: 'Extra closure',
      resume: 'Treatment resumes', resume_auto: 'day after the last missed fraction', scen: 'Repair date unknown: compare possible resume days', scen_days: 'Days to scan',
      lg_delivered: 'delivered', lg_missed: 'missed', lg_planned: 'planned', lg_new: 'new fraction', lg_bid: 'two fractions', lg_holiday: 'holiday / closed', lg_unavail: 'unavailable', lg_chemo: 'chemo', lg_end: 'planned last day',
      s_bio: 'Radiobiological parameters', tumour: 'Tumour', ab: 'α/β (Gy)', rate: 'Repopulation', rate_k: 'K (Gy BED/day)', rate_dp: 'D_prolif (Gy EQD2/day)', tk: 'Kick-off T_k (days)',
      oars: 'Organs at risk', oar_hint: 'The first one is the reference late tissue. Dose ratio = OAR dose ÷ prescription dose (1 = point dose at prescription, the conservative RCR approach).',
      name: 'Name', ratio: 'Dose ratio', limit: 'Limit EQD2 (Gy)', add_oar: 'Add organ', site_defaults: 'Restore site defaults',
      s_dept: 'What the department can do', dept_hint: 'All methods are always calculated. These switches only exclude options, and the reason is shown.',
      c_sat: 'Saturday treatment', c_sun: 'Sunday treatment', c_bid: 'Two fractions per day (BID)', c_bid_h: 'Minimum BID interval (h)', c_bid_max: 'Max d for BID (Gy)',
      c_consec: 'BID on consecutive days', c_dose: 'Change of dose per fraction', c_maxd: 'Max dose per fraction (Gy)', c_extra: 'Extra fractions', c_week: 'Max fractions per week',
      c_chemo_daily: 'Chemotherapy is given daily', c_round: 'Dose rounding (Gy)', c_tolT: 'Accepted tumour shortfall (%)', c_tolL: 'Accepted late-tissue increase (%)',
      tol_hint: 'Local choices, not RCR values. Left empty, the tool never suggests a change of fraction size by itself and lists the options for a clinical decision. With both set, it suggests the first dose-modified schedule inside them.',
      none_opt: 'no limit',
      st_recommended: 'Suggested for discussion', dec_note: 'This is the tool\'s reading of the RCR order of consideration, not an RCR algorithm. The treating clinician decides.',
      cause: 'Cause of the interruption', cause_: 'not stated', cause_machine: 'Machine fault or service', cause_holiday: 'Holiday or closure', cause_toxicity: 'Acute toxicity', cause_patient: 'Other patient reason (illness, transport)', cause_other: 'Other',
      c_weekly: 'Max rise of the peak 7-day dose (%)', not_set: 'not set', acute_row: 'Peak 7-day dose', col_wk: '7-day dose', acute_hint: 'Peak 7-day dose: the largest EQD2 given in any 7 consecutive days, as a simple indicator of acute-reaction intensity. It is this tool\'s indicator, not an RCR quantity.',
      chips: ['Linear-quadratic model', 'RCR 2019 decision order', '26 tumour sites', 'Ελληνικά / English', 'Runs offline'], dev: 'Developed by', lic: 'Open source under the GNU AGPL-3.0. Commercial licences are available from the author.', src: 'Source code',
      repair: 'Repair T½ (h)', bt_ratio: 'Brachy dose ratio', brachy: 'Brachytherapy (HDR) is part of the course', brachy_hint: 'Fixed dates and doses. The primary level receives the full dose, other levels none, each organ its brachytherapy dose ratio. No external beam is planned on these days, and they count in the overall time. If the dates move, enter the new ones.', bt_date: 'Date', bt_dose: 'Dose (Gy)', add_bt: 'Add fraction', lg_bt: 'brachytherapy',
      ratio_hint: 'With several phases, a dose ratio can be given per phase as 0.9/0.1. Repair T½ applies between two fractions on the same day; leave it empty for complete repair.',
      generic_note: 'These are the generic RCR values, derived mainly from head and neck data. For this site they are an assumption to review.',
      unc: 'With the parameters varied', unc_same: 'same suggestion in', robust_yes: 'robust', robust_no: 'parameter-sensitive',
      hand: 'Check by hand', hand_hint: 'The same result as a short sum, for independent verification with a calculator.', hand_rep: 'repopulation', hand_bid: 'two per day',
      selftest: 'Self-test against published worked examples', st_exp: 'Published', st_got: 'This engine', st_pass: 'passed',
      map_title: 'Trade-off map', map_sub: 'Every option as a point: change in tumour dose against change in the reference late tissue. The origin is the prescribed plan. Tap a point to select it.', map_x: 'Δ late tissue (%)', map_y: 'Δ tumour (%)', map_feas: 'feasible', map_excl: 'excluded', map_given: 'entered schedule',
      lc: 'Local control (rule of thumb)', lc_txt: 'about −{a} to −{b} %', lc_none: 'no loss expected', lc_hint: 'Tumour shortfall expressed in days of repopulation × 1.0–1.4 % per day. A rough guide for fast-growing tumours, not a TCP model.',
      rec_line: 'Recoverable share of the uncompensated tumour loss', rec_fixed: 'without raising any late dose', rec_5: 'accepting up to +5 % late dose',
      given: 'Schedule that was given, or your own', given_hint: 'Enter a schedule to evaluate it beside the calculated options. Useful for checking past decisions.', given_n: 'Fractions after the gap', given_d: 'Dose per fraction (Gy)', given_sat: 'Uses Saturdays', given_sun: 'Uses Sundays', given_bid: 'BID days', given_title: 'Entered schedule',
      tf_apply: 'Apply the published time factor', tf_note: 'Published estimate of the dose lost per day of prolongation for this site. It is linear over the whole course (T_k = 0), so only differences of EQD2_T between schedules are meaningful.', st_no_action: 'No compensation needed', st_clinical_decision: 'Clinical decision needed', st_no_gap: 'Nothing to compensate', st_error: 'Check the input',
      why: 'How the decision was reached', weigh: 'Options to weigh',
      chart_title: 'Biological dose to the tumour over time', chart_sub: 'Cumulative EQD2 of the primary level, corrected for repopulation after T_k',
      ch_planned: 'as prescribed', ch_uncomp: 'no compensation', ch_sel: 'selected option', ch_gy: 'Gy EQD2',
      options: 'Feasible options', options_hint: 'In the RCR order of consideration. Tap a row for its calendar and doses.',
      col_option: 'Option', col_d: 'd (Gy)', col_n: 'fx', col_end: 'Ends', col_ext: 'Δt (d)', col_t: 'Tumour', col_delta: 'Δ EQD2 vs plan (Gy)',
      excluded: 'Excluded options and the rule that excluded each',
      detail: 'Selected option', remaining: 'Remaining', ends: 'Ends', ot: 'overall time', vs_plan: 'vs plan', exact: 'exact', scale: 'scale × planned doses',
      tissues: 'Tissue', eqd2: 'EQD2 (Gy)', planned_c: 'Planned', change: 'Change', dates: 'Treatment dates', warnings: 'Notes for this option',
      robust: 'Robustness to the radiobiological parameters', rob_grid: 'combinations', rob_line: 'With the chosen schedule fixed, across the grid:',
      rob_same: 'Decision re-run for each combination: same recommendation in', rob_cases: 'cases', rob_dec: 'Recommendation', rob_drange: 'd range (Gy)', rob_worst: 'Worst tumour case',
      g_ab: 'tumour α/β ×', g_rep: 'repopulation ×', g_tk: 'T_k shift (d)', g_late: 'late α/β ×',
      scen_title: 'If treatment resumes on…', scen_hint: 'Each row re-runs the whole decision from the first missed day.', scen_resume: 'Resume', scen_uncomp: 'Uncompensated', scen_dec: 'Decision',
      input_checks: 'Input checks', errors: 'The calculation cannot run',
      record: 'Report', case_ref: 'Case reference (stays in this browser)', calc_by: 'Calculated by', checked_by: 'Checked by', approved_by: 'Approved by (clinician)', date: 'Date',
      pdf: 'Save PDF report', pdf_lang: 'Report language', json: 'Save input (JSON)', copy_json: 'Copy input', import: 'Import input (JSON)', copied: 'Copied', saved: 'Saved', busy: 'Preparing…',
      save_fail: 'The file could not be saved here.', import_fail: 'This file is not an RTGap input.',
      checksum: 'Input SHA-256', software: 'Software', generated: 'Generated',
      refs_title: 'References', refs_hint: 'Numbers in square brackets across the page point here.',
      method: 'Method', method_text: 'BED = Σ d (1 + d / (α/β)) for every tissue; EQD2 = BED / (1 + 2 / (α/β)). For the tumour, repopulation is subtracted after the kick-off time: EQD2_T = EQD2 − D_prolif · (T − T_k), with T from the first to the last fraction. K (BED per day, RCR) and D_prolif (EQD2 per day) are related by K = D_prolif · (1 + 2 / (α/β)). When the dose per fraction changes, the whole plan is scaled and the scale is solved in closed form. Doses are rounded before they are evaluated. With several dose levels the primary level drives the decision and each level uses its own overall time.',
      disclaimer: 'Decision support, not a medical device. The calculation uses the linear-quadratic model with generic parameters and does not replace clinical judgement. All parameters and rules must be reviewed by the treating team, and every modified schedule must be checked independently before use.',
      xval: 'The calculation engine of this page is verified against the reference Python implementation on 268 cases (1806 schedules) and reproduces the worked examples of refs [1] and [3]. On 9 standard LQ schedules it agrees exactly with the independent RadComp calculator.',
      joiner_t: 'Dose-per-fraction error (Joiner)', joiner_h: 'A wrong dose per fraction was given for some fractions. The compensating schedule restores every tissue at once, whatever its α/β. Valid without incomplete repair and with unchanged overall time.',
      j_P: 'Planned total P (Gy)', j_p: 'Planned d (Gy)', j_E: 'Dose given in error E (Gy)', j_e: 'Erroneous d (Gy)', j_res: 'Compensation', j_bad: 'No exact compensation exists for these values.',
      eq_t: 'BED / EQD2', eq_n: 'Fractions', eq_d: 'd (Gy)', eq_ab: 'α/β (Gy)', eq_T: 'Overall time (d)', eq_dp: 'D_prolif (Gy/d)', eq_tk: 'T_k (d)',
      page: 'Page', of: 'of', rep_title: 'Interruption compensation report', rep_case: 'Case', rep_summary: 'Case summary', rep_decision: 'Decision', rep_selected: 'Schedule', rep_all: 'All feasible options',
      rx_line: 'Prescription', status_line: 'Status', delivered_n: 'delivered', remaining_n: 'remaining', missed_n: 'Missed days', dept_line: 'Department', yes: 'yes', no: 'no',
      site_notes: 'Site notes', sources: 'Sources', params_site: 'site default', edited: 'edited',
      fx: 'fx', hol: { newyear: "New Year's Day", epiphany: 'Epiphany', cleanmonday: 'Clean Monday', mar25: '25 March', goodfriday: 'Good Friday', easter: 'Easter Sunday', eastermonday: 'Easter Monday', may1: 'Labour Day', holyspirit: 'Holy Spirit Monday', aug15: 'Dormition (15 Aug)', oct28: 'Ochi Day', xmas: 'Christmas Day', dec26: '26 December' },
    },
    el: {
      tagline: 'Αντιστάθμιση απρογραμμάτιστων διακοπών ακτινοθεραπείας',
      sub: 'Γραμμικό-τετραγωνικό μοντέλο · σειρά αποφάσεων RCR · κάθε κανόνας με την πηγή του',
      lang_label: 'Γλώσσα', case: 'Περιστατικό', result: 'Αποτέλεσμα', refs: 'Βιβλιογραφία', tools: 'Υπολογιστές',
      examples: 'Φόρτωση παραδείγματος', ex_pick: 'Παραδείγματα…', reset: 'Νέο περιστατικό',
      s_site: 'Εντοπισμός όγκου', s_site_hint: 'Ορίζει την κατηγορία RCR, την επιτρεπτή παράταση και τις προεπιλεγμένες παραμέτρους. Όλα αλλάζουν παρακάτω.',
      cat: 'Κατηγορία', cat_auto: 'από τον εντοπισμό', cat1: '1 · ριζική, ταχείας ανάπτυξης', cat2: '2 · ριζική, βραδύτερη', cat3: '3 · παρηγορική', cat_none: 'καμία',
      allowance: 'Επιτρεπτή παράταση', ideal: 'ιδανικά', max: 'μέγιστο', days: 'ημ.', ott_cap: 'Όριο συνολικού χρόνου', no_accel: 'Χωρίς επιταχυνόμενο σχήμα',
      s_rx: 'Συνταγογράφηση', start: 'Πρώτο κλάσμα', fractions: 'Κλάσματα', dpf: 'Δόση ανά κλάσμα (Gy)', total: 'Σύνολο',
      levels_mode: 'Πολλά επίπεδα δόσης ή φάσεις (SIB, διαδοχικό boost)', phase: 'Φάση', phase_name: 'Όνομα', add_phase: 'Προσθήκη φάσης', add_level: 'Προσθήκη επιπέδου', level: 'Επίπεδο', remove: 'Αφαίρεση',
      primary: 'Κύριο επίπεδο (καθορίζει την απόφαση)', treat_days: 'Ημέρες θεραπείας', gr_holidays: 'Οι ελληνικές αργίες είναι ημέρες χωρίς θεραπεία',
      s_gap: 'Διακοπή', gap_hint: 'Πατήστε τις ημέρες στο ημερολόγιο. Η επιλογή παρακάτω ορίζει τι σημειώνει το πάτημα.',
      m_missed: 'Χαμένη', m_unavail: 'Μηχάνημα εκτός', m_chemo: 'Χημειοθεραπεία', m_closed: 'Επιπλέον αργία',
      resume: 'Επανέναρξη θεραπείας', resume_auto: 'η επομένη του τελευταίου χαμένου κλάσματος', scen: 'Άγνωστη ημερομηνία επισκευής: σύγκριση πιθανών ημερών επανέναρξης', scen_days: 'Ημέρες προς έλεγχο',
      lg_delivered: 'χορηγήθηκε', lg_missed: 'χάθηκε', lg_planned: 'προγραμματισμένη', lg_new: 'νέο κλάσμα', lg_bid: 'δύο κλάσματα', lg_holiday: 'αργία / κλειστά', lg_unavail: 'εκτός λειτουργίας', lg_chemo: 'χημειοθ.', lg_end: 'προγρ. τελευταία ημέρα',
      s_bio: 'Ραδιοβιολογικές παράμετροι', tumour: 'Όγκος', ab: 'α/β (Gy)', rate: 'Επαναπληθυσμός', rate_k: 'K (Gy BED/ημέρα)', rate_dp: 'D_prolif (Gy EQD2/ημέρα)', tk: 'Έναρξη T_k (ημέρες)',
      oars: 'Όργανα σε κίνδυνο', oar_hint: 'Το πρώτο είναι ο ιστός αναφοράς για τις όψιμες αντιδράσεις. Λόγος δόσης = δόση οργάνου ÷ δόση συνταγογράφησης (1 = σημειακή δόση στη συνταγογράφηση, η συντηρητική προσέγγιση του RCR).',
      name: 'Όνομα', ratio: 'Λόγος δόσης', limit: 'Όριο EQD2 (Gy)', add_oar: 'Προσθήκη οργάνου', site_defaults: 'Επαναφορά τιμών εντοπισμού',
      s_dept: 'Τι μπορεί να κάνει το τμήμα', dept_hint: 'Υπολογίζονται πάντα όλες οι μέθοδοι. Οι διακόπτες απλώς αποκλείουν επιλογές, και ο λόγος εμφανίζεται.',
      c_sat: 'Θεραπεία Σάββατο', c_sun: 'Θεραπεία Κυριακή', c_bid: 'Δύο κλάσματα την ημέρα (BID)', c_bid_h: 'Ελάχιστο διάστημα BID (ώρες)', c_bid_max: 'Μέγιστη d για BID (Gy)',
      c_consec: 'BID σε συνεχόμενες ημέρες', c_dose: 'Αλλαγή δόσης ανά κλάσμα', c_maxd: 'Μέγιστη δόση ανά κλάσμα (Gy)', c_extra: 'Επιπλέον κλάσματα', c_week: 'Μέγιστα κλάσματα ανά εβδομάδα',
      c_chemo_daily: 'Η χημειοθεραπεία χορηγείται καθημερινά', c_round: 'Στρογγυλοποίηση δόσης (Gy)', c_tolT: 'Αποδεκτό έλλειμμα όγκου (%)', c_tolL: 'Αποδεκτή αύξηση όψιμων ιστών (%)',
      tol_hint: 'Τοπικές επιλογές, όχι τιμές του RCR. Αν μείνουν κενές, το εργαλείο δεν προτείνει ποτέ μόνο του αλλαγή μεγέθους κλάσματος και παραθέτει τις επιλογές για κλινική απόφαση. Με συμπληρωμένες και τις δύο, προτείνει το πρώτο σχήμα με αλλαγή δόσης που είναι εντός τους.',
      none_opt: 'χωρίς όριο',
      st_recommended: 'Πρόταση προς συζήτηση', dec_note: 'Πρόκειται για την ανάγνωση της σειράς εξέτασης του RCR από το εργαλείο, όχι για αλγόριθμο του RCR. Αποφασίζει ο θεράπων ιατρός.',
      cause: 'Αιτία της διακοπής', cause_: 'δεν δηλώθηκε', cause_machine: 'Βλάβη ή συντήρηση μηχανήματος', cause_holiday: 'Αργία ή κλειστό τμήμα', cause_toxicity: 'Οξεία τοξικότητα', cause_patient: 'Άλλος λόγος ασθενούς (νόσος, μετακίνηση)', cause_other: 'Άλλο',
      c_weekly: 'Μέγιστη αύξηση της δόσης αιχμής 7 ημερών (%)', not_set: 'χωρίς τιμή', acute_row: 'Δόση αιχμής 7 ημερών', col_wk: 'Δόση 7 ημ.', acute_hint: 'Δόση αιχμής 7 ημερών: η μεγαλύτερη EQD2 που δίνεται σε 7 συνεχόμενες ημέρες, ως απλός δείκτης της έντασης των οξειών αντιδράσεων. Είναι δείκτης του εργαλείου, όχι μέγεθος του RCR.',
      chips: ['Γραμμικό-τετραγωνικό μοντέλο', 'Σειρά αποφάσεων RCR 2019', '26 εντοπισμοί', 'Ελληνικά / English', 'Λειτουργεί χωρίς σύνδεση'], dev: 'Ανάπτυξη', lic: 'Ανοιχτό λογισμικό με άδεια GNU AGPL-3.0. Εμπορικές άδειες διατίθενται από τον δημιουργό.', src: 'Πηγαίος κώδικας',
      repair: 'T½ επιδιόρθωσης (ώρες)', bt_ratio: 'Λόγος δόσης βραχυθ.', brachy: 'Το σχήμα περιλαμβάνει βραχυθεραπεία (HDR)', brachy_hint: 'Σταθερές ημερομηνίες και δόσεις. Το κύριο επίπεδο παίρνει ολόκληρη τη δόση, τα άλλα επίπεδα καμία, κάθε όργανο τον δικό του λόγο δόσης βραχυθεραπείας. Τις ημέρες αυτές δεν προγραμματίζεται εξωτερική ακτινοθεραπεία, και μετρούν στον συνολικό χρόνο. Αν οι ημερομηνίες αλλάξουν, δώστε τις νέες.', bt_date: 'Ημερομηνία', bt_dose: 'Δόση (Gy)', add_bt: 'Προσθήκη κλάσματος', lg_bt: 'βραχυθεραπεία',
      ratio_hint: 'Με πολλές φάσεις, ο λόγος δόσης δίνεται ανά φάση ως 0.9/0.1. Ο T½ επιδιόρθωσης ισχύει μεταξύ δύο κλασμάτων της ίδιας ημέρας· αφήστε τον κενό για πλήρη επιδιόρθωση.',
      generic_note: 'Πρόκειται για τις γενικές τιμές του RCR, που προέρχονται κυρίως από δεδομένα κεφαλής-τραχήλου. Για αυτόν τον εντοπισμό είναι παραδοχή προς έλεγχο.',
      unc: 'Με μεταβολή των παραμέτρων', unc_same: 'ίδια πρόταση στο', robust_yes: 'σταθερή', robust_no: 'ευαίσθητη στις παραμέτρους',
      hand: 'Έλεγχος με το χέρι', hand_hint: 'Το ίδιο αποτέλεσμα ως σύντομο άθροισμα, για ανεξάρτητη επαλήθευση με αριθμομηχανή.', hand_rep: 'επαναπληθυσμός', hand_bid: 'δύο την ημέρα',
      selftest: 'Αυτοέλεγχος με δημοσιευμένα λυμένα παραδείγματα', st_exp: 'Δημοσιευμένο', st_got: 'Η μηχανή', st_pass: 'επιτυχείς',
      map_title: 'Χάρτης επιλογών', map_sub: 'Κάθε επιλογή ως σημείο: μεταβολή της δόσης του όγκου έναντι της μεταβολής στον όψιμο ιστό αναφοράς. Η αρχή των αξόνων είναι το αρχικό πλάνο. Πατήστε ένα σημείο για να το επιλέξετε.', map_x: 'Δ όψιμου ιστού (%)', map_y: 'Δ όγκου (%)', map_feas: 'εφικτή', map_excl: 'αποκλεισμένη', map_given: 'δοθέν σχήμα',
      lc: 'Τοπικός έλεγχος (εμπειρικός κανόνας)', lc_txt: 'περίπου −{a} έως −{b} %', lc_none: 'δεν αναμένεται απώλεια', lc_hint: 'Το έλλειμμα του όγκου εκφρασμένο σε ημέρες επαναπληθυσμού × 1.0–1.4 % ανά ημέρα. Αδρή εκτίμηση για ταχέως αναπτυσσόμενους όγκους, όχι μοντέλο TCP.',
      rec_line: 'Ανακτήσιμο μέρος της απώλειας του όγκου', rec_fixed: 'χωρίς αύξηση δόσης στους όψιμους ιστούς', rec_5: 'με αποδοχή έως +5 % στους όψιμους',
      given: 'Σχήμα που δόθηκε, ή δικό σας', given_hint: 'Δώστε ένα σχήμα για να αξιολογηθεί δίπλα στις υπολογισμένες επιλογές. Χρήσιμο για έλεγχο παλαιών αποφάσεων.', given_n: 'Κλάσματα μετά τη διακοπή', given_d: 'Δόση ανά κλάσμα (Gy)', given_sat: 'Με Σάββατα', given_sun: 'Με Κυριακές', given_bid: 'Ημέρες BID', given_title: 'Δοθέν σχήμα',
      tf_apply: 'Εφαρμογή δημοσιευμένου παράγοντα χρόνου', tf_note: 'Δημοσιευμένη εκτίμηση της δόσης που χάνεται ανά ημέρα παράτασης για αυτόν τον εντοπισμό. Είναι γραμμική σε όλη τη θεραπεία (T_k = 0), άρα νόημα έχουν μόνο οι διαφορές EQD2_T μεταξύ σχημάτων.', st_no_action: 'Δεν χρειάζεται αντιστάθμιση', st_clinical_decision: 'Χρειάζεται κλινική απόφαση', st_no_gap: 'Τίποτα προς αντιστάθμιση', st_error: 'Ελέγξτε τα στοιχεία',
      why: 'Πώς προέκυψε η απόφαση', weigh: 'Επιλογές προς στάθμιση',
      chart_title: 'Βιολογική δόση στον όγκο στον χρόνο', chart_sub: 'Αθροιστική EQD2 του κύριου επιπέδου, διορθωμένη για επαναπληθυσμό μετά το T_k',
      ch_planned: 'όπως συνταγογραφήθηκε', ch_uncomp: 'χωρίς αντιστάθμιση', ch_sel: 'επιλεγμένο σχήμα', ch_gy: 'Gy EQD2',
      options: 'Εφικτές επιλογές', options_hint: 'Με τη σειρά εξέτασης του RCR. Πατήστε μια γραμμή για ημερολόγιο και δόσεις.',
      col_option: 'Επιλογή', col_d: 'd (Gy)', col_n: 'κλ.', col_end: 'Λήξη', col_ext: 'Δt (ημ.)', col_t: 'Όγκος', col_delta: 'Δ EQD2 έναντι πλάνου (Gy)',
      excluded: 'Αποκλεισμένες επιλογές και ο κανόνας που τις απέκλεισε',
      detail: 'Επιλεγμένο σχήμα', remaining: 'Υπόλοιπο', ends: 'Λήξη', ot: 'συνολικός χρόνος', vs_plan: 'έναντι πλάνου', exact: 'ακριβής', scale: 'συντελεστής × προγραμματισμένες δόσεις',
      tissues: 'Ιστός', eqd2: 'EQD2 (Gy)', planned_c: 'Πλάνο', change: 'Μεταβολή', dates: 'Ημερομηνίες θεραπείας', warnings: 'Σημειώσεις για το σχήμα',
      robust: 'Ευαισθησία στις ραδιοβιολογικές παραμέτρους', rob_grid: 'συνδυασμοί', rob_line: 'Με σταθερό το επιλεγμένο σχήμα, σε όλο το πλέγμα:',
      rob_same: 'Επανάληψη της απόφασης για κάθε συνδυασμό: ίδια σύσταση στο', rob_cases: 'περιπτώσεις', rob_dec: 'Σύσταση', rob_drange: 'εύρος d (Gy)', rob_worst: 'Δυσμενέστερη περίπτωση όγκου',
      g_ab: 'α/β όγκου ×', g_rep: 'επαναπληθυσμός ×', g_tk: 'μετατόπιση T_k (ημ.)', g_late: 'α/β όψιμων ×',
      scen_title: 'Αν η θεραπεία ξαναρχίσει…', scen_hint: 'Κάθε γραμμή επαναλαμβάνει ολόκληρη την απόφαση από την πρώτη χαμένη ημέρα.', scen_resume: 'Επανέναρξη', scen_uncomp: 'Χωρίς αντιστάθμιση', scen_dec: 'Απόφαση',
      input_checks: 'Έλεγχοι στοιχείων', errors: 'Ο υπολογισμός δεν μπορεί να γίνει',
      record: 'Αναφορά', case_ref: 'Κωδικός περιστατικού (μένει σε αυτόν τον browser)', calc_by: 'Υπολογίστηκε από', checked_by: 'Ελέγχθηκε από', approved_by: 'Εγκρίθηκε από (ιατρός)', date: 'Ημερομηνία',
      pdf: 'Αποθήκευση αναφοράς PDF', pdf_lang: 'Γλώσσα αναφοράς', json: 'Αποθήκευση στοιχείων (JSON)', copy_json: 'Αντιγραφή στοιχείων', import: 'Εισαγωγή στοιχείων (JSON)', copied: 'Αντιγράφηκε', saved: 'Αποθηκεύτηκε', busy: 'Ετοιμάζεται…',
      save_fail: 'Το αρχείο δεν μπόρεσε να αποθηκευτεί εδώ.', import_fail: 'Το αρχείο δεν είναι στοιχεία RTGap.',
      checksum: 'SHA-256 στοιχείων', software: 'Λογισμικό', generated: 'Δημιουργήθηκε',
      refs_title: 'Βιβλιογραφία', refs_hint: 'Οι αριθμοί σε αγκύλες σε όλη τη σελίδα παραπέμπουν εδώ.',
      method: 'Μέθοδος', method_text: 'BED = Σ d (1 + d / (α/β)) για κάθε ιστό· EQD2 = BED / (1 + 2 / (α/β)). Για τον όγκο αφαιρείται ο επαναπληθυσμός μετά τον χρόνο έναρξης: EQD2_T = EQD2 − D_prolif · (T − T_k), με T από το πρώτο έως το τελευταίο κλάσμα. Το K (BED ανά ημέρα, RCR) και το D_prolif (EQD2 ανά ημέρα) συνδέονται με K = D_prolif · (1 + 2 / (α/β)). Όταν αλλάζει η δόση ανά κλάσμα, κλιμακώνεται ολόκληρο το πλάνο και ο συντελεστής λύνεται αναλυτικά. Οι δόσεις στρογγυλοποιούνται πριν αξιολογηθούν. Με πολλά επίπεδα δόσης, το κύριο επίπεδο καθορίζει την απόφαση και κάθε επίπεδο έχει τον δικό του συνολικό χρόνο.',
      disclaimer: 'Υποστήριξη απόφασης, όχι ιατροτεχνολογικό προϊόν. Ο υπολογισμός βασίζεται στο γραμμικό-τετραγωνικό μοντέλο με γενικές παραμέτρους και δεν υποκαθιστά την κλινική κρίση. Όλες οι παράμετροι και οι κανόνες πρέπει να ελεγχθούν από τη θεραπευτική ομάδα, και κάθε τροποποιημένο σχήμα να επαληθευτεί ανεξάρτητα πριν εφαρμοστεί.',
      xval: 'Η υπολογιστική μηχανή της σελίδας έχει επαληθευτεί έναντι της υλοποίησης αναφοράς σε Python σε 268 περιστατικά (1806 σχήματα) και αναπαράγει τα λυμένα παραδείγματα των [1] και [3]. Σε 9 τυπικά σχήματα LQ συμφωνεί ακριβώς με τον ανεξάρτητο υπολογιστή RadComp.',
      joiner_t: 'Λάθος δόσης ανά κλάσμα (Joiner)', joiner_h: 'Σε κάποια κλάσματα δόθηκε λάθος δόση ανά κλάσμα. Το σχήμα αντιστάθμισης επαναφέρει όλους τους ιστούς ταυτόχρονα, ανεξάρτητα από το α/β. Ισχύει χωρίς ατελή επιδιόρθωση και με αμετάβλητο συνολικό χρόνο.',
      j_P: 'Προγραμματισμένη ολική P (Gy)', j_p: 'Προγραμματισμένη d (Gy)', j_E: 'Δόση που δόθηκε λάθος E (Gy)', j_e: 'Λανθασμένη d (Gy)', j_res: 'Αντιστάθμιση', j_bad: 'Δεν υπάρχει ακριβής αντιστάθμιση για αυτές τις τιμές.',
      eq_t: 'BED / EQD2', eq_n: 'Κλάσματα', eq_d: 'd (Gy)', eq_ab: 'α/β (Gy)', eq_T: 'Συνολικός χρόνος (ημ.)', eq_dp: 'D_prolif (Gy/ημ.)', eq_tk: 'T_k (ημ.)',
      page: 'Σελίδα', of: 'από', rep_title: 'Αναφορά αντιστάθμισης διακοπής', rep_case: 'Περιστατικό', rep_summary: 'Στοιχεία περιστατικού', rep_decision: 'Απόφαση', rep_selected: 'Σχήμα', rep_all: 'Όλες οι εφικτές επιλογές',
      rx_line: 'Συνταγογράφηση', status_line: 'Κατάσταση', delivered_n: 'χορηγήθηκαν', remaining_n: 'απομένουν', missed_n: 'Χαμένες ημέρες', dept_line: 'Τμήμα', yes: 'ναι', no: 'όχι',
      site_notes: 'Σημειώσεις εντοπισμού', sources: 'Πηγές', params_site: 'τιμή εντοπισμού', edited: 'τροποποιημένο',
      fx: 'κλ.', hol: { newyear: 'Πρωτοχρονιά', epiphany: 'Θεοφάνια', cleanmonday: 'Καθαρά Δευτέρα', mar25: '25η Μαρτίου', goodfriday: 'Μεγάλη Παρασκευή', easter: 'Κυριακή του Πάσχα', eastermonday: 'Δευτέρα του Πάσχα', may1: 'Πρωτομαγιά', holyspirit: 'Αγίου Πνεύματος', aug15: 'Κοίμηση της Θεοτόκου', oct28: '28η Οκτωβρίου', xmas: 'Χριστούγεννα', dec26: '26 Δεκεμβρίου' },
    },
  };

  const SITE_EL = {
    hn_scc: 'Ακανθοκυτταρικό κεφαλής-τραχήλου', nsclc: 'Μη μικροκυτταρικός καρκίνος πνεύμονα (ριζική)', sclc_chemort: 'Μικροκυτταρικός πνεύμονα, χημειοακτινοθεραπεία',
    cervix_scc: 'Ακανθοκυτταρικό τραχήλου μήτρας (εξωτερική)', oesophagus_scc: 'Ακανθοκυτταρικό οισοφάγου', oesophagus_adeno: 'Αδενοκαρκίνωμα οισοφάγου',
    anus_scc: 'Ακανθοκυτταρικό πρωκτού', skin_scc: 'Ακανθοκυτταρικό δέρματος', vulva_vagina_scc: 'Ακανθοκυτταρικό αιδοίου / κόλπου',
    medulloblastoma: 'Μυελοβλάστωμα / εμβρυϊκοί όγκοι ΚΝΣ', glioblastoma: 'Γλοιοβλάστωμα', ependymoma_intracranial: 'Ενδοκρανιακό επενδύμωμα', bladder: 'Καρκίνος ουροδόχου κύστης (ριζική)',
    short_doubling: 'Άλλος όγκος με μικρό χρόνο διπλασιασμού', cervix_scc_brachy: 'Τράχηλος μήτρας, εξωτερική + βραχυθεραπεία', vulva_vagina_scc_brachy: 'Αιδοίο / κόλπος, εξωτερική + βραχυθεραπεία',
    tongue_scc_brachy: 'Γλώσσα, εξωτερική + βραχυθεραπεία', anus_scc_brachy: 'Πρωκτός, εξωτερική + βραχυθεραπεία', breast: 'Αδενοκαρκίνωμα μαστού (ριζική / επικουρική)',
    prostate: 'Καρκίνος προστάτη (ριζική)', bladder_rcr2019: 'Ουροδόχος κύστη (ταξινόμηση 2019)', rectum: 'Αδενοκαρκίνωμα ορθού (ριζική / προεγχειρητική)',
    radical_other: 'Άλλη ριζική θεραπεία (κατηγορία 2)', palliative: 'Παρηγορική θεραπεία', sabr: 'SABR / στερεοτακτική', generic: 'Γενικό (χωρίς κανόνες εντοπισμού)',
  };
  const NOTES_EL = {
    cervix_scc: ['RCR: ο συνολικός χρόνος θεραπείας στο ακανθοκυτταρικό τραχήλου δεν πρέπει να ξεπερνά τις 56 ημέρες.'],
    glioblastoma: ['Κατηγορία 1 στο σχέδιο της 5ης έκδοσης (δεν αναφέρεται στην έκδοση του 2019).'],
    ependymoma_intracranial: ['Κατηγορία 1 στο σχέδιο της 5ης έκδοσης (δεν αναφέρεται στην έκδοση του 2019).'],
    bladder: ['Κατηγορία 1 στο σχέδιο της 5ης έκδοσης· κατηγορία 2 στην έκδοση του 2019.'],
    cervix_scc_brachy: ['RCR: συνδυασμός βραχυθεραπείας + εξωτερικής, μέγιστη παράταση 1–2 ημέρες (εδώ 1).', 'Ο συνολικός χρόνος δεν πρέπει να ξεπερνά τις 56 ημέρες.'],
    vulva_vagina_scc_brachy: ['RCR: συνδυασμός βραχυθεραπείας + εξωτερικής, μέγιστη παράταση 1–2 ημέρες.'],
    tongue_scc_brachy: ['RCR: συνδυασμός βραχυθεραπείας + εξωτερικής, μέγιστη παράταση 1–2 ημέρες.'],
    anus_scc_brachy: ['RCR: συνδυασμός βραχυθεραπείας + εξωτερικής, μέγιστη παράταση 1–2 ημέρες.'],
    breast: ['α/β όγκου 3.5 Gy (START, 95% CI 1.2–5.7). Χωρίς παράγοντα χρόνου ως προεπιλογή.', 'Το σχέδιο της 5ης έκδοσης δίνει ειδικές οδηγίες για τα υποκλασματοποιημένα σχήματα μαστού (15 και 5 κλασμάτων).'],
    prostate: ['α/β όγκου 1.6 Gy (Vogelius & Bentzen 2020, 95% CI 1.3–2.0). Χωρίς παράγοντα χρόνου ως προεπιλογή.', 'Με α/β μικρότερο από των όψιμων ιστών, λιγότερα και μεγαλύτερα κλάσματα ευνοούν τον όγκο: ελέγξτε και τις δύο παραλλαγές.'],
    bladder_rcr2019: ['Επιλέξτε «Καρκίνος ουροδόχου κύστης (ριζική)» για την ταξινόμηση του σχεδίου της 5ης έκδοσης (κατηγορία 1).'],
    rectum: ['Κατηγορία 2 ως «λοιπή ριζική» θεραπεία.'],
    sabr: ['RCR: το επιταχυνόμενο σχήμα δεν ενδείκνυται στο SABR. Ακολουθήστε το ειδικό κεφάλαιο του σχεδίου της 5ης έκδοσης και το τοπικό πρωτόκολλο SABR.'],
    generic: ['Χωρίς κανόνες κατηγορίας: ο στόχος είναι να κρατηθεί η προγραμματισμένη ημερομηνία λήξης.'],
  };

  const REFS = [
    { id: 'RCR19', short: 'RCR 2019', text: 'The Royal College of Radiologists. The timely delivery of radical radiotherapy: guidelines for the management of unscheduled treatment interruptions. 4th ed. London: RCR; 2019.', url: 'https://www.rcr.ac.uk/publication/timely-delivery-radical-radiotherapy-guidelines-management-unscheduled-treatment',
      use: { en: 'Categories 1–3 and prolongation allowances, order of compensation methods, BID ≥ 6 h and not above about 2.2 Gy, 56-day limit for cervix, generic α/β and K = 0.9 Gy/day after 28 days, worked examples (Appendix B).', el: 'Κατηγορίες 1–3 και επιτρεπτή παράταση, σειρά μεθόδων αντιστάθμισης, BID ≥ 6 ώρες και όχι πάνω από περίπου 2.2 Gy, όριο 56 ημερών στον τράχηλο, γενικά α/β και K = 0.9 Gy/ημέρα μετά τις 28 ημέρες, λυμένα παραδείγματα (Παράρτημα B).' } },
    { id: 'RCR5d', short: 'RCR 5th ed. (draft)', text: 'The Royal College of Radiologists. Management of unscheduled radiotherapy treatment interruptions: RCR guidance. 5th ed., draft for consultation.', url: 'https://www.rcr.ac.uk/media/wm4f0vg2/rt_interruptions_draft_for_consultation.pdf',
      use: { en: 'Bladder, glioblastoma and intracranial ependymoma in category 1; BID not on a chemotherapy day when chemotherapy is not daily or d > 1.5 Gy; incomplete repair possible even at 6 h. Draft: to be re-checked when the final edition is published.', el: 'Ουροδόχος κύστη, γλοιοβλάστωμα και ενδοκρανιακό επενδύμωμα στην κατηγορία 1· όχι BID σε ημέρα χημειοθεραπείας όταν αυτή δεν είναι καθημερινή ή d > 1.5 Gy· πιθανή ατελής επιδιόρθωση ακόμη και στις 6 ώρες. Σχέδιο: θα επανελεγχθεί με την τελική έκδοση.' } },
    { id: 'BCR', short: 'Bentzen & Joiner', text: 'Bentzen SM, Joiner MC. The linear-quadratic approach in clinical practice. In: Joiner MC, van der Kogel AJ, editors. Basic Clinical Radiobiology. 4th ed. London: Hodder Arnold; 2009. Chapter 9.', url: '',
      use: { en: 'EQD2 and the time correction with D_prolif (eq. 9.2), gap correction by change of fraction size (Example 5), limits of the LQ model at large doses per fraction, dose-error correction (eq. 9.3–9.4, Example 6).', el: 'EQD2 και διόρθωση χρόνου με D_prolif (εξ. 9.2), διόρθωση διακοπής με αλλαγή μεγέθους κλάσματος (Παράδειγμα 5), όρια του μοντέλου LQ σε μεγάλες δόσεις ανά κλάσμα, διόρθωση λάθους δόσης (εξ. 9.3–9.4, Παράδειγμα 6).' } },
    { id: 'JOINER', short: 'Joiner 2004', text: 'Joiner MC. A simple α/β-independent method to derive fully isoeffective schedules following changes in dose per fraction. Int J Radiat Oncol Biol Phys. 2004;58(3):871–875.', url: '',
      use: { en: 'Compensation of dose-per-fraction errors, independent of α/β.', el: 'Αντιστάθμιση λαθών δόσης ανά κλάσμα, ανεξάρτητα από το α/β.' } },
    { id: 'DALE', short: 'Dale et al. 2002', text: 'Dale RG, Hendry JH, Jones B, Robertson AG, Deehan C, Sinclair JA. Practical methods for compensating for missed treatment days in radiotherapy, with particular reference to head and neck schedules. Clin Oncol. 2002;14(5):382–393.', url: 'https://doi.org/10.1053/clon.2002.0111',
      use: { en: 'BED-based compensation methods and the working repopulation value for head and neck used by the RCR.', el: 'Μέθοδοι αντιστάθμισης με βάση το BED και η τιμή επαναπληθυσμού για κεφαλή-τράχηλο που υιοθετεί το RCR.' } },
    { id: 'HENDRY', short: 'Hendry et al. 1996', text: 'Hendry JH, Bentzen SM, Dale RG, Fowler JF, Wheldon TE, Jones B, Munro AJ, Slevin NJ, Robertson AG. A modelled comparison of the effects of using different ways to compensate for missed treatment days in radiotherapy. Clin Oncol. 1996;8(5):297–307.', url: '',
      use: { en: 'The original modelled comparison of compensation strategies behind the RCR guidance.', el: 'Η αρχική σύγκριση στρατηγικών αντιστάθμισης με μοντέλα, πίσω από τις οδηγίες του RCR.' } },
    { id: 'THAMES', short: 'Thames 1985', text: 'Thames HD. An "incomplete-repair" model for survival after fractionated and continuous irradiations. Int J Radiat Biol. 1985;47(3):319–339.', url: '',
      use: { en: 'Incomplete repair between two fractions on the same day (optional repair half-time per organ).', el: 'Ατελής επιδιόρθωση μεταξύ δύο κλασμάτων της ίδιας ημέρας (προαιρετικός χρόνος ημιζωής επιδιόρθωσης ανά όργανο).' } },
    { id: 'FOWLER', short: 'Fowler 1989', text: 'Fowler JF. The linear-quadratic formula and progress in fractionated radiotherapy. Br J Radiol. 1989;62(740):679–694.', url: 'https://doi.org/10.1259/0007-1285-62-740-679',
      use: { en: 'Biologically effective dose (BED).', el: 'Βιολογικά ενεργός δόση (BED).' } },
    { id: 'START', short: 'Haviland et al. 2013', text: 'Haviland JS, Owen JR, Dewar JA, et al. The UK Standardisation of Breast Radiotherapy (START) trials of radiotherapy hypofractionation for treatment of early breast cancer: 10-year follow-up results of two randomised controlled trials. Lancet Oncol. 2013;14(11):1086–1094.', url: 'https://pubmed.ncbi.nlm.nih.gov/24055415/',
      use: { en: 'Breast tumour α/β = 3.5 Gy.', el: 'α/β όγκου μαστού = 3.5 Gy.' } },
    { id: 'VB20', short: 'Vogelius & Bentzen 2020', text: 'Vogelius IR, Bentzen SM. Diminishing returns from ultrahypofractionated radiation therapy for prostate cancer. Int J Radiat Oncol Biol Phys. 2020;107(2):299–304.', url: 'https://doi.org/10.1016/j.ijrobp.2020.01.010',
      use: { en: 'Prostate tumour α/β = 1.6 Gy.', el: 'α/β όγκου προστάτη = 1.6 Gy.' } },
    { id: 'STARTT', short: 'Haviland et al. 2016', text: 'Haviland JS, Bentzen SM, Bliss JM, Yarnold JR; START Trial Management Group. Prolongation of overall treatment time as a cause of treatment failure in early breast cancer: an analysis of the UK START (Standardisation of Breast Radiotherapy) trials of radiotherapy fractionation. Radiother Oncol. 2016. doi:10.1016/j.radonc.2016.08.027', url: 'https://doi.org/10.1016/j.radonc.2016.08.027',
      use: { en: 'Optional breast time factor of about 0.6 Gy/day. The authors present it as hypothesis-generating.', el: 'Προαιρετικός παράγοντας χρόνου μαστού, περίπου 0.6 Gy/ημέρα. Οι συγγραφείς τον παρουσιάζουν ως υπόθεση προς έλεγχο.' } },
    { id: 'VB13', short: 'Vogelius & Bentzen 2013', text: 'Vogelius IR, Bentzen SM. Meta-analysis of the alpha/beta ratio for prostate cancer in the presence of an overall time factor: bad news, good news, or no news? Int J Radiat Oncol Biol Phys. 2013;85(1):89–94.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3556929',
      use: { en: 'Optional prostate time factor of 0.31 Gy/day (95% CI 0.20–0.42).', el: 'Προαιρετικός παράγοντας χρόνου προστάτη 0.31 Gy/ημέρα (95% CI 0.20–0.42).' } },
    { id: 'BENTZEN99', short: 'Bentzen et al. 1999', text: 'Bentzen SM, Saunders MI, Dische S. Repair halftimes estimated from observations of treatment-related morbidity after CHART or conventional radiotherapy in head and neck cancer. Radiother Oncol. 1999;53(3):219–226.', url: 'https://doi.org/10.1016/S0167-8140(99)00151-6',
      use: { en: 'Default repair half-time of 4.4 h for late-responding organs between two fractions on one day (fibrosis; 3.8 h telangiectasia, 4.9 h laryngeal oedema).', el: 'Προεπιλεγμένος χρόνος ημιζωής επιδιόρθωσης 4.4 ώρες για όψιμα όργανα μεταξύ δύο κλασμάτων της ίδιας ημέρας (ίνωση· 3.8 ώρες τηλαγγειεκτασία, 4.9 ώρες οίδημα λάρυγγα).' } },
    { id: 'PUTORA', short: 'Putora et al. 2012', text: 'Putora PM, Schmuecking M, Aebersold D, Plasswilm L. Compensability index for compensation radiotherapy after treatment interruptions. Radiat Oncol. 2012;7:208.', url: 'https://doi.org/10.1186/1748-717X-7-208',
      use: { en: 'The idea of rating how far an interruption can be compensated, and of searching across schedule intensity and days used. The "recoverable share" shown here is this tool\'s own, simpler measure.', el: 'Η ιδέα της βαθμολόγησης του πόσο αντισταθμίζεται μια διακοπή και της αναζήτησης ως προς την ένταση του σχήματος και τις ημέρες. Το «ανακτήσιμο μέρος» εδώ είναι απλούστερο, δικό μας μέτρο.' } },
  ];
  const REF_NUM = {}; REFS.forEach((r, i) => { REF_NUM[r.id] = i + 1; });

  function make(lang) {
    const L = S[lang], el = lang === 'el';
    const t = (k) => (k in L ? L[k] : (S.en[k] != null ? S.en[k] : k));
    const f1 = (x) => (Math.abs(x) < 0.05 ? 0 : x).toFixed(1), f2 = (x) => x.toFixed(2);
    const sg = (x, nd) => { nd = nd == null ? 1 : nd; const v = Math.abs(x) < 0.5 * Math.pow(10, -nd) ? 0 : x; return (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(nd); };
    const sgi = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
    const date = (d) => { const p = RT.ymd(d); return WDN[lang][RT.weekday(d)] + ' ' + p.d + '/' + p.m + '/' + p.y; };
    const dshort = (d) => { const p = RT.ymd(d); return WDN[lang][RT.weekday(d)] + ' ' + p.d + '/' + p.m; };
    const siteName = (id, site) => (el && SITE_EL[id]) ? SITE_EL[id] : (site ? site.name : id);
    const siteNotes = (id, site) => (el && NOTES_EL[id]) ? NOTES_EL[id] : ((site && site.notes) || []);

    function optTitle(o) {
      const x = o.t || {}, b = x.base || o.key;
      const acc = { sat: el ? 'Σάββατα' : 'Saturdays', satsun: el ? 'Σάββατα + Κυριακές' : 'Saturdays + Sundays', bid: 'BID',
        sat_bid: el ? 'Σάββατα + BID' : 'Saturdays + BID', satsun_bid: el ? 'Σάββατα + Κυριακές + BID' : 'Saturdays + Sundays + BID' };
      let s;
      if (b === 'none') s = el ? 'Καμία αντιστάθμιση' : 'No compensation';
      else if (acc[b] && !x.solved) s = acc[b] + (el ? ', ίδια d' : ', same d');
      else if (acc[b]) s = acc[b] + ', ' + sgi(x.ext) + (el ? ' ημ., νέα d' : ' d, new d');
      else if (b.indexOf('same_end') === 0) {
        s = (el ? 'Ίδια λήξη, ' + x.n + ' κλ. αντί ' + x.k : 'Same end date, ' + x.n + ' fx instead of ' + x.k);
        if (b === 'same_end_sat') s += el ? ' (με Σάβ.)' : ' (incl. Sat)';
        if (b === 'same_end_satsun') s += el ? ' (με Σάβ.+Κυρ.)' : ' (incl. Sat+Sun)';
      } else if (b === 'extended') s = el ? 'Παράταση ' + sgi(x.ext) + ' ημ., ' + x.k + ' κλ., νέα d' : 'Prolongation ' + sgi(x.ext) + ' d, ' + x.k + ' fx, new d';
      else if (b === 'extra') s = el ? 'Παράταση ' + sgi(x.ext) + ' ημ., +' + x.extra + ' κλ. στην προγρ. δόση' : 'Prolongation ' + sgi(x.ext) + ' d, +' + x.extra + ' fx at the planned dose';
      else if (b === 'custom') s = (el ? 'Δοθέν σχήμα' : 'Entered schedule') + ': ' + o.nNew + ' × ' + o.d.toFixed(2) + ' Gy';
      else s = o.key;
      if (x.match === 'tumour') s += el ? ' · ισοδύναμο για τον όγκο' : ' · tumour-matched';
      if (x.match === 'late') s += el ? ' · ισοδύναμο για ' + x.lateName : ' · matched to ' + x.lateName;
      return s;
    }
    function optShort(o) {
      const extras = [];
      if (o.nSat) extras.push(o.nSat + (el ? ' Σάβ.' : ' Sat'));
      if (o.nSun) extras.push(o.nSun + (el ? ' Κυρ.' : ' Sun'));
      if (o.nBid) extras.push(o.nBid + (el ? ' ημέρες BID' : ' BID days'));
      return o.nNew + ' × ' + f2(o.d) + ' Gy, ' + (el ? 'λήξη ' : 'ends ') + date(o.end) + ' (' + sgi(o.ext) + (el ? ' ημ.)' : ' d)') + (extras.length ? ' · ' + extras.join(', ') : '');
    }
    function optMethod(o) {
      const m = { baseline: el ? 'Συνέχιση με την προγραμματισμένη d και αποδοχή της παράτασης' : 'Continue at the planned d and accept the prolongation',
        weekend: el ? 'RCR: θεραπεία το Σαββατοκύριακο, ίδια δόση ανά κλάσμα' : 'RCR: weekend treatment, same dose per fraction',
        bid: el ? 'RCR: δύο κλάσματα την ημέρα με διάστημα ≥ 6 ωρών' : 'RCR: two fractions per day at least 6 h apart',
        weekend_bid: el ? 'RCR: Σαββατοκύριακα και δύο κλάσματα την ημέρα' : 'RCR: weekends and two fractions per day',
        accel_dose: el ? 'Επιτάχυνση που δεν αρκεί μόνη της, με προσαρμογή της d' : 'Acceleration that is not enough alone, with d adjusted',
        same_end: el ? 'Λιγότερα και μεγαλύτερα κλάσματα μέχρι την προγραμματισμένη λήξη' : 'Fewer, larger fractions up to the planned end date',
        extended: el ? 'Αποδοχή της παράτασης και αύξηση της d' : 'Accept the prolongation and raise d',
        custom: el ? 'Σχήμα που έδωσε ο χρήστης' : 'Schedule entered by the user',
        extra: el ? 'Επιπλέον κλάσματα στην προγραμματισμένη d, όταν ο χρόνος δεν μπορεί να κρατηθεί' : 'Extra fractions at the planned d, when the overall time cannot be kept' };
      const refs = { baseline: [], weekend: ['RCR19'], bid: ['RCR19'], weekend_bid: ['RCR19'], accel_dose: ['RCR19', 'DALE'], same_end: ['BCR', 'RCR19'], extended: ['RCR19', 'DALE'], extra: ['RCR19'] };
      return { text: m[o.family] || '', refs: refs[o.family] || [] };
    }
    function reason(w) {
      const p = w.p || {};
      const m = {
        x_sat: el ? 'Δεν γίνεται θεραπεία το Σάββατο (τμήμα)' : 'Saturday treatment not available (department)',
        x_sun: el ? 'Δεν γίνεται θεραπεία την Κυριακή (τμήμα)' : 'Sunday treatment not available (department)',
        x_bid: el ? 'Δεν γίνεται BID (τμήμα)' : 'BID not available (department)',
        x_bid_dose: () => el ? 'BID με d = ' + f2(p.d) + ' Gy > ' + p.max + ' Gy' : 'BID with d = ' + f2(p.d) + ' Gy > ' + p.max + ' Gy',
        x_bid_chemo: el ? 'BID σε ημέρα χημειοθεραπείας (μη καθημερινή χημειοθεραπεία ή d > 1.5 Gy)' : 'BID on a chemotherapy day (non-daily chemotherapy or d > 1.5 Gy)',
        x_bid_consec: el ? 'BID σε συνεχόμενες ημέρες (τμήμα)' : 'BID on consecutive days (department)',
        x_dose_change: el ? 'Δεν επιτρέπεται αλλαγή της δόσης ανά κλάσμα (τμήμα)' : 'Change of dose per fraction not permitted (department)',
        x_extra: el ? 'Δεν επιτρέπονται επιπλέον κλάσματα (τμήμα)' : 'Extra fractions not permitted (department)',
        x_max_d: () => el ? 'd = ' + f2(p.d) + ' Gy πάνω από το όριο του τμήματος (' + p.max + ' Gy)' : 'd = ' + f2(p.d) + ' Gy above the department maximum (' + p.max + ' Gy)',
        x_week: () => el ? p.n + ' κλάσματα σε μία εβδομάδα > όριο τμήματος ' + p.max : p.n + ' fractions in one week > department maximum ' + p.max,
        x_ott: () => el ? 'Συνολικός χρόνος ' + p.T + ' ημ. > ' + p.max + ' ημ. (κανόνας εντοπισμού)' : 'Overall time ' + p.T + ' d > ' + p.max + ' d (site rule)',
        x_noaccel: el ? 'Το τροποποιημένο σχήμα δεν ενδείκνυται για αυτόν τον εντοπισμό' : 'Modified scheduling is not appropriate for this site',
        x_weekly: () => el ? 'Δόση αιχμής 7 ημερών +' + p.inc.toFixed(0) + ' % > όριο τμήματος +' + p.max + ' % (οξείες αντιδράσεις)' : 'Peak 7-day dose +' + p.inc.toFixed(0) + ' % > department maximum +' + p.max + ' % (acute reactions)',
        w_weekly: () => el ? 'Δόση αιχμής 7 ημερών ' + p.peak.toFixed(1) + ' Gy EQD2 (+' + p.inc.toFixed(0) + ' % έναντι πλάνου): ταχύτερη συσσώρευση δόσης, αναμένονται εντονότερες οξείες αντιδράσεις.' : 'Peak 7-day dose ' + p.peak.toFixed(1) + ' Gy EQD2 (+' + p.inc.toFixed(0) + ' % vs plan): faster dose accumulation, expect stronger acute reactions.',
        w_tox: el ? 'Η διακοπή οφείλεται σε οξεία τοξικότητα: η επιτάχυνση ή τα μεγαλύτερα κλάσματα μπορεί να αντενδείκνυνται.' : 'The interruption was caused by acute toxicity: acceleration or larger fractions may be contraindicated.',
        x_limit: () => el ? p.name + ': EQD2 ' + f1(p.eqd2) + ' Gy > όριο ' + p.limit + ' Gy' : p.name + ': EQD2 ' + f1(p.eqd2) + ' Gy > limit ' + p.limit + ' Gy',
        w_extra_insufficient: el ? 'Τα επιπλέον κλάσματα δεν επαναφέρουν τη δόση του όγκου: ο επαναπληθυσμός ξεπερνά την πρόσθετη δόση.' : 'Extra fractions cannot restore the tumour dose: repopulation outpaces the added dose.',
        w_bid_consec: el ? 'BID σε συνεχόμενες ημέρες: η ατελής επιδιόρθωση μπορεί να συσσωρευτεί, ιδίως σε εγκέφαλο και νωτιαίο μυελό.' : 'BID on consecutive days: incomplete repair may accumulate, especially in brain and spinal cord.',
        w_bid_repair: () => el ? 'Οι δόσεις των όψιμων ιστών θεωρούν πλήρη επιδιόρθωση μεταξύ των κλασμάτων BID (' + p.h + ' ώρες)· μπορεί να είναι ατελής ακόμη και στις 6 ώρες.' : 'Late-tissue doses assume complete repair between BID fractions (' + p.h + ' h); repair may be incomplete even at 6 h.',
        w_large_d: el ? 'd ≥ 6 Gy: η προέκταση του μοντέλου LQ σε μεγάλες δόσεις ανά κλάσμα είναι αβέβαιη.' : 'd ≥ 6 Gy: the LQ model is uncertain at large doses per fraction.',
        w_scale: () => el ? 'Το μέγεθος κλάσματος αυξάνεται κατά ' + p.pct.toFixed(0) + ' %: το αποτέλεσμα εξαρτάται έντονα από τα α/β.' : 'Fraction size rises by ' + p.pct.toFixed(0) + ' %: the result depends strongly on the α/β values.',
        w_replan: el ? 'Η δόση ανά κλάσμα αλλάζει: το πλάνο πρέπει να κλιμακωθεί ή να ξανασχεδιαστεί στο TPS (MU, κανονικοποίηση, όρια OAR) και να ελεγχθεί ανεξάρτητα.' : 'The dose per fraction changes: the plan must be rescaled or re-planned in the TPS (MU, normalisation, OAR constraints) and checked independently.',
        w_over_allowance: () => el ? 'Παράταση ' + p.ext + ' ημ. πάνω από το επιτρεπτό (' + p.max + ' ημ.)' + (p.cat ? ' της κατηγορίας ' + p.cat : '') + '.' : 'Prolongation of ' + p.ext + ' d exceeds the allowance (' + p.max + ' d)' + (p.cat ? ' of category ' + p.cat : '') + '.',
      };
      const v = m[w.code]; return typeof v === 'function' ? v() : (v || w.code);
    }
    function trace(s) {
      const p = s.p || {};
      const m = {
        t_nocat: el ? 'Χωρίς κατηγορία RCR: στόχος να κρατηθεί η προγραμματισμένη λήξη.' : 'No RCR category: the aim is to keep the planned end date.',
        t_rules: () => (p.cat ? (el ? 'Κατηγορία RCR ' + p.cat : 'RCR category ' + p.cat) : (el ? 'Κανόνες περιστατικού' : 'Case rules')) + (el ? ': παράταση ιδανικά ≤ ' + p.ideal + ' ημ., το πολύ ≤ ' + p.max + ' ημ.' : ': prolongation ideally ≤ ' + p.ideal + ' d, at most ≤ ' + p.max + ' d') + (p.ott ? (el ? '· συνολικός χρόνος ≤ ' + p.ott + ' ημ.' : '; overall time ≤ ' + p.ott + ' d') : '') + '.',
        t_base: () => el ? 'Χωρίς αντιστάθμιση η θεραπεία λήγει ' + date(p.end) + ' (' + sgi(p.ext) + ' ημ.) και η EQD2 του όγκου αλλάζει κατά ' + sg(p.d) + ' Gy (' + sg(p.pct) + ' %).' : 'Without compensation the course ends ' + date(p.end) + ' (' + sgi(p.ext) + ' d) and the tumour EQD2 changes by ' + sg(p.d) + ' Gy (' + sg(p.pct) + ' %).',
        t_transfer: el ? 'Βλάβη μηχανήματος: το RCR συνιστά πρώτα θεραπεία την ίδια ημέρα σε αντίστοιχο (matched) μηχάνημα, αν υπάρχει.' : 'Machine fault: the RCR first advises treatment on a matched machine on the same day, if one is available.',
        t_notime: el ? 'Δεν έχει οριστεί παράγοντας χρόνου για τον όγκο: το μοντέλο δεν ποσοτικοποιεί την απώλεια από την παράταση. Το όριο της κατηγορίας εξακολουθεί να ισχύει.' : 'No time factor is set for this tumour: the model does not quantify the loss from prolongation. The category allowance still applies.',
        t_tox: el ? 'Η διακοπή οφείλεται σε οξεία τοξικότητα: δεν προτείνεται αυτόματα επιτάχυνση ή μεγαλύτερο κλάσμα. Προηγείται η κλινική εκτίμηση των αντιδράσεων.' : 'The interruption was caused by acute toxicity: acceleration and larger fractions are not suggested automatically. Clinical assessment of the reactions comes first.',
        t_s5_off: el ? 'Βήμα 5: χρειάζεται αλλαγή μεγέθους κλάσματος. Δεν έχουν οριστεί τοπικές ανοχές, άρα η στάθμιση δόσης όγκου και όψιμων επιδράσεων είναι κλινική απόφαση.' : 'Step 5: a change of fraction size is needed. No local tolerances are set, so the trade-off between tumour dose and late effects is a clinical decision.',
        t_noaccel: el ? 'Κανόνας εντοπισμού: χωρίς επιταχυνόμενο ή τροποποιημένο σχήμα· η θεραπεία συνεχίζεται όπως σχεδιάστηκε.' : 'Site rule: no accelerated or modified scheduling; the course continues as planned.',
        t_s1_ok: () => el ? 'Βήμα 1: παράταση ' + p.ext + ' ημ. ≤ ιδανικό ' + p.ideal + ' ημ. Δεν χρειάζεται αντιστάθμιση.' : 'Step 1: prolongation ' + p.ext + ' d ≤ ideal ' + p.ideal + ' d. No compensation needed.',
        t_s1: () => el ? 'Βήμα 1: παράταση ' + p.ext + ' ημ. > ιδανικό ' + p.ideal + ' ημ. Εξετάζεται αντιστάθμιση.' : 'Step 1: prolongation ' + p.ext + ' d > ideal ' + p.ideal + ' d. Compensation is considered.',
        t_s2: () => el ? 'Βήμα 2: «' + optTitle(p.o) + '» κρατά την παράταση στις ' + p.o.ext + ' ημ. με την προγραμματισμένη d.' : 'Step 2: "' + optTitle(p.o) + '" keeps the prolongation at ' + p.o.ext + ' d with the planned d.',
        t_s2_excl: () => (el ? 'Βήμα 2: οι επιλογές Σαββατοκύριακου/BID με ίδια d αποκλείστηκαν: ' : 'Step 2: the same-d weekend/BID options were excluded: ') + p.reasons.map(reason).join('; ') + '.',
        t_s2_none: el ? 'Βήμα 2: καμία επιλογή Σαββατοκύριακου/BID με ίδια d δεν φτάνει το ιδανικό.' : 'Step 2: no same-d weekend/BID option reaches the ideal allowance.',
        t_s3: () => el ? 'Βήμα 3: παράταση ' + p.ext + ' ημ. ≤ μέγιστο ' + p.max + ' ημ. Γίνεται αποδεκτή χωρίς αντιστάθμιση.' : 'Step 3: prolongation ' + p.ext + ' d ≤ maximum ' + p.max + ' d. Accepted without compensation.',
        t_s4: () => el ? 'Βήμα 4: «' + optTitle(p.o) + '» φέρνει την παράταση στις ' + p.o.ext + ' ημ. (≤ ' + p.max + ' ημ.).' : 'Step 4: "' + optTitle(p.o) + '" brings the prolongation to ' + p.o.ext + ' d (≤ ' + p.max + ' d).',
        t_s34: () => el ? 'Βήματα 3–4: η παράταση δεν κρατιέται εντός ' + p.max + ' ημ. με την προγραμματισμένη d.' : 'Steps 3–4: the prolongation cannot be kept within ' + p.max + ' d with the planned d.',
        t_s5: () => el ? 'Βήμα 5: «' + optTitle(p.o) + '» είναι εντός των τοπικών ανοχών (έλλειμμα όγκου ≤ ' + p.tolT + ' %, αύξηση όψιμων ≤ ' + p.tolL + ' %).' : 'Step 5: "' + optTitle(p.o) + '" is within the local tolerances (tumour shortfall ≤ ' + p.tolT + ' %, late increase ≤ ' + p.tolL + ' %).',
        t_s5_none: () => el ? 'Βήμα 5: καμία επιλογή με αλλαγή δόσης δεν ικανοποιεί και τις δύο ανοχές (έλλειμμα όγκου ≤ ' + p.tolT + ' %, αύξηση όψιμων ≤ ' + p.tolL + ' %). Η στάθμιση είναι κλινική απόφαση.' : 'Step 5: no dose-modified option meets both tolerances (tumour shortfall ≤ ' + p.tolT + ' %, late increase ≤ ' + p.tolL + ' %). The trade-off is a clinical decision.',
      };
      const v = m[s.code]; return typeof v === 'function' ? v() : (v || s.code);
    }
    function head(h) {
      const p = h.p || {};
      const m = { h_no_gap: el ? 'Δεν απομένουν κλάσματα: τίποτα προς αντιστάθμιση.' : 'No fractions remain: nothing to compensate.',
        h_noaccel: el ? 'Συνέχιση με την προγραμματισμένη δόση ανά κλάσμα (χωρίς επιτάχυνση για αυτόν τον εντοπισμό).' : 'Continue at the planned dose per fraction (no acceleration for this site).',
        h_all_excluded: el ? 'Οι κανόνες αποκλείουν κάθε επιλογή: χρειάζεται κλινική απόφαση.' : 'The rules exclude every option: a clinical decision is needed.',
        h_none: el ? 'Η παράταση είναι εντός του επιτρεπτού. Η θεραπεία συνεχίζεται ως έχει.' : 'The prolongation is within the allowance. Treatment continues unchanged.',
        h_none_within: () => el ? 'Παράταση ' + p.ext + ' ημ., εντός του επιτρεπτού. Η θεραπεία συνεχίζεται ως έχει.' : 'Prolongation of ' + p.ext + ' d, within the allowance. Treatment continues unchanged.',
        h_option: () => optTitle(p.o),
        h_tox: el ? 'Διακοπή λόγω οξείας τοξικότητας: η αντιστάθμιση είναι κλινική απόφαση.' : 'Interruption due to acute toxicity: compensation is a clinical decision.',
        h_dose_decision: el ? 'Χρειάζεται αλλαγή μεγέθους κλάσματος: κλινική απόφαση μεταξύ των επιλογών.' : 'A change of fraction size is needed: clinical decision between the options.',
        h_clinical: el ? 'Καμία επιλογή δεν επαναφέρει τη δόση του όγκου χωρίς να αυξήσει τη δόση των όψιμων ιστών πέρα από την ανοχή.' : 'No option restores the tumour dose without raising the late-tissue dose beyond the tolerance.' };
      const v = m[h.code]; return typeof v === 'function' ? v() : (v || h.code);
    }
    function issue(w) {
      const p = w.p || {};
      const m = {
        e_site: () => el ? 'Άγνωστος εντοπισμός: ' + p.site : 'Unknown site: ' + p.site,
        e_generic: () => (el ? 'Μη έγκυρα στοιχεία: ' : 'Invalid input: ') + p.msg,
        e_outage: el ? 'Η έναρξη βλάβης χρειάζεται και ημερομηνία επανέναρξης.' : 'An outage start needs a resume date.',
        e_missed_before: () => el ? 'Η χαμένη ημέρα ' + date(p.d) + ' είναι πριν από την έναρξη της θεραπείας (' + date(p.start) + ').' : 'Missed day ' + date(p.d) + ' is before the start of treatment (' + date(p.start) + ').',
        e_resume_before: () => el ? 'Η επανέναρξη (' + date(p.r) + ') πρέπει να είναι μετά την τελευταία χαμένη ημέρα (' + date(p.m) + ').' : 'The resume date (' + date(p.r) + ') must be after the last missed day (' + date(p.m) + ').',
        e_resume_start: () => el ? 'Η επανέναρξη (' + date(p.r) + ') είναι πριν από την έναρξη της θεραπείας.' : 'The resume date (' + date(p.r) + ') is before the start of treatment.',
        e_ratio_neg: () => el ? p.name + ': ο λόγος δόσης δεν μπορεί να είναι αρνητικός.' : p.name + ': the dose ratio cannot be negative.',
        v_missed_closed: () => el ? 'Η ' + date(p.d) + ' είναι αργία: δεν ήταν ημέρα θεραπείας.' : date(p.d) + ' is a planned closure: it was never a treatment day.',
        v_missed_noplan: () => el ? 'Η ' + date(p.d) + ' δεν ήταν προγραμματισμένη ημέρα θεραπείας και δεν επηρεάζει τον υπολογισμό.' : date(p.d) + ' was not a planned treatment day and has no effect.',
        v_missed_after: () => el ? 'Η ' + date(p.d) + ' είναι μετά την προγραμματισμένη λήξη (' + date(p.end) + ').' : date(p.d) + ' is after the planned end (' + date(p.end) + ').',
        v_no_missed: el ? 'Δεν έχουν σημειωθεί χαμένες ημέρες: το κενό ορίζεται μόνο από την ημερομηνία επανέναρξης.' : 'No missed days are marked: only the resume date defines the gap.',
        v_all_delivered: el ? 'Όλα τα κλάσματα έχουν χορηγηθεί.' : 'All prescribed fractions have been delivered.',
        v_unavail_past: () => el ? 'Η ημέρα «εκτός λειτουργίας» ' + date(p.d) + ' είναι πριν από την επανέναρξη και δεν επηρεάζει.' : 'Unavailable day ' + date(p.d) + ' is before the resume date and has no effect.',
        v_chemo_out: () => el ? 'Η ημέρα χημειοθεραπείας ' + date(p.d) + ' είναι εκτός της περιόδου θεραπείας.' : 'Chemotherapy day ' + date(p.d) + ' is outside the treatment period.',
        v_ab_tumour: () => el ? p.name + ': ασυνήθιστο α/β όγκου (' + p.ab + ' Gy).' : p.name + ': unusual tumour α/β (' + p.ab + ' Gy).',
        v_no_tk: () => el ? p.name + ': ρυθμός επαναπληθυσμού χωρίς χρόνο έναρξης· ο παράγοντας χρόνου αγνοείται.' : p.name + ': repopulation rate without a kick-off time; the time factor is ignored.',
        v_dprolif_high: () => el ? p.name + ': D_prolif = ' + p.v.toFixed(2) + ' Gy/ημέρα είναι ασυνήθιστα υψηλό (ελέγξτε μονάδες K ή D_prolif).' : p.name + ': D_prolif = ' + p.v.toFixed(2) + ' Gy/day is unusually high (check K versus D_prolif units).',
        v_ratio_high: () => el ? p.name + ': λόγος δόσης > 1.2· ελέγξτε την τιμή.' : p.name + ': dose ratio > 1.2; check the value.',
        v_ab_oar: () => el ? p.name + ': ασυνήθιστο α/β (' + p.ab + ' Gy) για όψιμη αντίδραση.' : p.name + ': unusual α/β (' + p.ab + ' Gy) for a late endpoint.',
        v_brachy_before: () => el ? 'Το κλάσμα βραχυθεραπείας της ' + date(p.d) + ' είναι πριν από την έναρξη της εξωτερικής ακτινοθεραπείας.' : 'The brachytherapy fraction on ' + date(p.d) + ' is before the start of external beam treatment.',
        v_bid_interval: () => el ? 'Διάστημα BID ' + p.h + ' ώρες: κάτω από το ελάχιστο των 6 ωρών του RCR.' : 'BID interval of ' + p.h + ' h is below the RCR minimum of 6 h.',
        v_rounding: () => el ? 'Η στρογγυλοποίηση δόσης (' + p.v + ' Gy) είναι αδρή.' : 'Dose rounding of ' + p.v + ' Gy is coarse.',
      };
      const v = m[w.code]; return typeof v === 'function' ? v() : (v || w.code);
    }
    return { lang, el, t, f1, f2, sg, sgi, date, dshort, wd2: WD2[lang], wdn: WDN[lang], mon: MON[lang], siteName, siteNotes, optTitle, optShort, optMethod, reason, trace, head, issue, hol: (k) => L.hol[k] || k };
  }
  root.I18N = { make, REFS, REF_NUM };
})(typeof window !== 'undefined' ? window : globalThis);
