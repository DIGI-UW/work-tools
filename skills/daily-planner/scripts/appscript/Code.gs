/**
 * Daily Planner — Apps Script Backend
 *
 * Serves the post-it dashboard AND acts as the API layer for the skill.
 * Apps Script has native read/write permissions on its bound spreadsheet,
 * so NO service account or gspread is needed — the skill talks to this
 * web app via plain HTTP requests.
 *
 * Deploy as Web App: Execute as "Me", Access "Anyone" (or "Anyone within [your org]")
 *
 * Authentication: Every request must include a token that matches the
 * PLANNER_TOKEN value stored in the Config tab (key: "planner_token").
 * GET requests: ?token=VALUE    POST requests: {"token": "VALUE", ...}
 * The dashboard (served via doGet with no ?page) is exempt — it's just HTML.
 */

// ═══════════════════════════════════════════════════════════════
// Tab & header definitions (single source of truth)
// ═══════════════════════════════════════════════════════════════

var TABS = {
  Today:     { headers: ['#','Task','Priority','Est. Hours','Type','Stream','Time Block','Source','Source Link','Status','Notes','Actual Hours'], rows: 100 },
  History:   { headers: ['Date','Task','Priority','Est. Hours','Actual Hours','Type','Source','Status','Carried Over','Notes'], rows: 500 },
  Recurring: { headers: ['Task','Description','Frequency','Est. Hours','Priority Base','Type','Last Completed','Next Due','Max Defer Days','Preferred Day','Active','Notes'], rows: 100 },
  Velocity:  { headers: ['Date','Tasks Planned','Tasks Completed','Tasks Deferred','Est. Total Hours','Actual Total Hours','Accuracy Ratio','Completion Rate','Plannable Hours','Utilization'], rows: 500 },
  Config:    { headers: ['Key','Value','Description'], rows: 50 },
  PlanJSON:  { headers: null, rows: 2 }  // no headers — row 1 IS the data
};

var COL_WIDTHS = {
  Today:     [40,350,70,90,110,60,110,90,250,90,280,90],
  History:   [100,350,70,90,90,110,90,90,90,280],
  Recurring: [200,350,90,90,90,110,110,110,100,100,70,280],
  Velocity:  [100,100,110,100,110,120,100,110,110,90],
  Config:    [220,250,350]
};

var DEFAULT_CONFIG = [
  ['work_hours_per_day','8','Total work hours per day'],
  ['buffer_minutes','30','Unplanned buffer per day in minutes'],
  ['morning_focus_hours','3','Hours before first meeting preferred for deep work'],
  ['max_parallel_ai_streams','2','How many AI background streams to plan'],
  ['default_task_estimate','1.0','Default hours when no estimate available'],
  ['high_priority_threshold','8','Priority score for must-do tier'],
  ['medium_priority_threshold','5','Priority score for should-do tier'],
  ['carry_over_boost','1','Priority boost per day a task is carried over'],
  ['estimation_calibration','1.0','Multiplier for estimates (updated from Velocity)'],
  ['jira_project_keys','','Comma-separated Jira project keys to monitor'],
  ['github_repos','','Comma-separated repo names to check'],
  ['slack_channels','','Key Slack channels to monitor'],
  ['dashboard_url','','Web app URL from Apps Script deployment'],
  ['spreadsheet_id','','Google Sheets spreadsheet ID (auto-populated on init)'],
  ['planner_token','','Shared secret for API auth — set this, then set DAILY_PLANNER_TOKEN env var to match'],
  ['current_plan_date','','Date of the current Today plan (YYYY-MM-DD, auto-set on save)'],
  ['pomodoro_work_minutes','25','Pomodoro work session duration in minutes'],
  ['pomodoro_break_minutes','5','Pomodoro break duration in minutes'],
  ['pomodoro_snooze_enabled','true','Ring bell again at snooze interval until dismissed'],
  ['pomodoro_snooze_minutes','2','Minutes between snooze bells']
];

var SAMPLE_RECURRING = [
  ['Community PR review','Review external contributor PRs in OpenELIS/OpenMRS repos','biweekly','1.0','4','hands-on','','','5','','TRUE',''],
  ['Dependency audit','Check for security vulnerabilities and outdated deps','weekly','0.5','3','delegatable','','','3','Monday','TRUE',''],
  ['1:1 prep','Prepare notes and agenda for 1:1 meetings','weekly','0.3','6','hands-on','','','0','','TRUE','Before each 1:1'],
  ['Sprint retro notes','Write up retro observations and action items','biweekly','0.5','5','hands-on','','','2','Friday','TRUE',''],
  ['Inbox zero pass','Clear Slack DMs, email flags, PR notifications','daily','0.25','3','hands-on','','','1','','TRUE',''],
  ['CI pipeline health check','Review CI run times, flaky tests, failure rates','weekly','0.5','4','delegatable','','','4','Wednesday','TRUE',''],
  ['Harvest time reconciliation','Verify logged hours match actual work, submit timesheets','weekly','0.25','5','hands-on','','','2','Friday','TRUE',''],
  ['Knowledge base update','Update docs, wikis, runbooks with recent learnings','biweekly','1.0','3','hands-on','','','7','','TRUE',''],
  ['Tech debt triage','Review and prioritize tech debt backlog items','monthly','1.0','4','hands-on','','','7','','TRUE',''],
  ['Tool/workflow optimization','Improve dev environment, scripts, automation','monthly','1.5','3','delegatable','','','14','','TRUE','']
];


// ═══════════════════════════════════════════════════════════════
// Token Authentication
// ═══════════════════════════════════════════════════════════════

/**
 * Validate request token against the planner_token stored in Config tab.
 * Returns true if valid, false otherwise.
 */
function validateToken_(token) {
  if (!token) return false;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Config');
  if (!sheet) return false;

  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === 'planner_token') {
      return String(data[i][1]).trim() === String(token).trim();
    }
  }
  return false; // no token configured → reject
}


// ═══════════════════════════════════════════════════════════════
// Web App Entry Points
// ═══════════════════════════════════════════════════════════════

function doGet(e) {
  // Auto-initialize on first run (Config tab missing = fresh spreadsheet)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName('Config')) {
    initializeSheet();
  }

  var page = (e && e.parameter && e.parameter.page) || 'dashboard';

  // Dashboard HTML is public (it's just a rendered page, no write access)
  if (page === 'dashboard') {
    var requestedDate = e && e.parameter && e.parameter.date;
    var html = HtmlService.createTemplateFromFile('Dashboard');
    html.planData = JSON.stringify(requestedDate ? getPlanByDate_(requestedDate) : buildPlanData_());
    html.availableDates = JSON.stringify(getAvailablePlanDates_());
    html.requestedDate = requestedDate || '';
    html.deployUrl = ScriptApp.getService().getUrl();
    var cfg = readConfig_().config || {};
    html.pomodoroConfig = JSON.stringify({
      workMinutes: Number(cfg.pomodoro_work_minutes) || 25,
      breakMinutes: Number(cfg.pomodoro_break_minutes) || 5,
      snoozeEnabled: String(cfg.pomodoro_snooze_enabled || 'true').toLowerCase() !== 'false',
      snoozeMinutes: Number(cfg.pomodoro_snooze_minutes) || 2
    });
    return html.evaluate()
      .setTitle('Daily Planner')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // All API reads require token
  var token = e && e.parameter && e.parameter.token;
  if (!validateToken_(token)) {
    return jsonResponse_({ok: false, error: 'Unauthorized — invalid or missing token'});
  }

  switch (page) {
    case 'api':
      return jsonResponse_(buildPlanData_());

    case 'today':
      return jsonResponse_(readToday_());

    case 'config':
      return jsonResponse_(readConfig_());

    case 'recurring':
      return jsonResponse_(readRecurring_());

    case 'velocity':
      return jsonResponse_(readVelocity_());

    case 'history':
      var days = Number(e.parameter.days) || 7;
      return jsonResponse_(readHistory_(days));

    case 'status':
      return jsonResponse_(getSheetStatus_());

    default:
      return jsonResponse_({ok: false, error: 'Unknown page: ' + page});
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);

    var action = payload.action;

    // init is exempt from token check when Config tab doesn't exist yet
    // (chicken-and-egg: init creates the Config tab that holds the token)
    if (action === 'init') {
      return jsonResponse_(initializeSheet());
    }

    // All other writes require token
    if (!validateToken_(payload.token)) {
      return jsonResponse_({ok: false, error: 'Unauthorized — invalid or missing token'});
    }

    switch (action) {
      case 'save_today':     return jsonResponse_(doSaveToday_(payload.tasks));
      case 'write_plan_json':return jsonResponse_(doWritePlanJson_(payload.data));
      case 'update_status':  return jsonResponse_(doUpdateStatus_(payload.task_title, payload.status));
      case 'archive_day':    return jsonResponse_(doArchiveDay_(payload.date, payload.tasks));
      case 'log_velocity':   return jsonResponse_(doLogVelocity_(payload.data));
      case 'update_recurring':return jsonResponse_(doUpdateRecurring_(payload.task_name, payload.updates));
      case 'set_config':     return jsonResponse_(doSetConfig_(payload.key, payload.value));
      default:
        return jsonResponse_({ok: false, error: 'Unknown action: ' + action});
    }
  } catch (err) {
    return jsonResponse_({ok: false, error: String(err)});
  }
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// ═══════════════════════════════════════════════════════════════
// POST Actions — Write Operations
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize (or re-initialize) the spreadsheet.
 * Creates tabs, writes/fixes headers, applies formatting and column widths,
 * merges missing Config defaults, seeds Recurring if empty, and adds
 * conditional formatting to Today.
 *
 * Safe to call repeatedly — preserves existing data and user-set config values.
 * Visible in the Apps Script function dropdown so you can run it manually.
 */
function initializeSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheets().map(function(s) { return s.getName(); });
  var created = [];

  // Create or update tabs
  Object.keys(TABS).forEach(function(name) {
    var def = TABS[name];
    var ws;

    if (existing.indexOf(name) === -1) {
      ws = ss.insertSheet(name);
      // Resize to expected dimensions
      if (ws.getMaxRows() < def.rows) ws.insertRowsAfter(ws.getMaxRows(), def.rows - ws.getMaxRows());
      if (def.headers && ws.getMaxColumns() < def.headers.length) {
        ws.insertColumnsAfter(ws.getMaxColumns(), def.headers.length - ws.getMaxColumns());
      }
      created.push(name);
    } else {
      ws = ss.getSheetByName(name);
    }

    // PlanJSON has no headers — skip
    if (!def.headers) return;

    // Always write/fix headers (ensures new columns are picked up on re-init)
    ws.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);

    // Always apply header formatting
    var headerRange = ws.getRange(1, 1, 1, def.headers.length);
    headerRange
      .setBackground('#1F3864')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    ws.setFrozenRows(1);

    // Always apply column widths
    if (COL_WIDTHS[name]) {
      COL_WIDTHS[name].forEach(function(w, i) {
        ws.setColumnWidth(i + 1, w);
      });
    }
  });

  // Merge Config defaults — add any missing keys without overwriting existing values
  var configSheet = ss.getSheetByName('Config');
  var existingKeys = {};
  if (configSheet.getLastRow() > 1) {
    var configData = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 1).getValues();
    configData.forEach(function(row) { existingKeys[String(row[0]).trim()] = true; });
  }
  var toAdd = [];
  DEFAULT_CONFIG.forEach(function(row) {
    if (!existingKeys[row[0]]) {
      toAdd.push(row);
    }
  });
  if (configSheet.getLastRow() <= 1) {
    // Fresh Config — write all defaults
    configSheet.getRange(2, 1, DEFAULT_CONFIG.length, 3).setValues(DEFAULT_CONFIG);
  } else if (toAdd.length) {
    // Existing Config — append only missing keys
    configSheet.getRange(configSheet.getLastRow() + 1, 1, toAdd.length, 3).setValues(toAdd);
  }
  // Always auto-populate spreadsheet_id
  doSetConfig_('spreadsheet_id', ss.getId());

  // Populate sample recurring tasks if empty
  var recurringSheet = ss.getSheetByName('Recurring');
  if (recurringSheet.getLastRow() <= 1) {
    recurringSheet.getRange(2, 1, SAMPLE_RECURRING.length, SAMPLE_RECURRING[0].length).setValues(SAMPLE_RECURRING);
  }

  // Always (re-)apply conditional formatting on Today tab
  applyTodayConditionalFormatting_(ss.getSheetByName('Today'));

  // Remove default Sheet1 if other tabs exist
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(sheet1); } catch(e) {}
  }

  return {
    ok: true,
    created: created,
    message: created.length ? 'Created: ' + created.join(', ') : 'All tabs verified and formatting refreshed',
    spreadsheet_url: ss.getUrl(),
    spreadsheet_id: ss.getId()
  };
}

function applyTodayConditionalFormatting_(sheet) {
  var range = sheet.getRange('A2:L100');

  // Priority 8-10: light red
  var rule1 = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($C2>=8,$C2<>"")')
    .setBackground('#FFCCCC')
    .setRanges([range]).build();

  // Priority 5-7: light yellow
  var rule2 = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($C2>=5,$C2<8)')
    .setBackground('#FFFFCC')
    .setRanges([range]).build();

  // Priority 1-4: light green
  var rule3 = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($C2>=1,$C2<5)')
    .setBackground('#CCFFCC')
    .setRanges([range]).build();

  // Status "done": green text + strikethrough
  var rule4 = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J2="done"')
    .setFontColor('#228B22')
    .setStrikethrough(true)
    .setRanges([range]).build();

  // Status "deferred": orange text
  var rule5 = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J2="deferred"')
    .setFontColor('#D98719')
    .setRanges([range]).build();

  sheet.setConditionalFormatRules([rule1, rule2, rule3, rule4, rule5]);
}

/**
 * Save today's plan. Clears existing data and writes new tasks.
 */
function doSaveToday_(tasks) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Today');
  if (!sheet) return {ok: false, error: 'No Today tab'};

  // Clear below header
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).clearContent();
  }

  if (!tasks || !tasks.length) return {ok: true, count: 0};

  var rows = tasks.map(function(t, i) {
    return [
      i + 1,
      t.task || '',
      t.priority || '',
      t.est_hours || '',
      t.type || '',
      t.stream || '',
      t.time_block || '',
      t.source || '',
      t.source_link || '',
      t.status || 'planned',
      t.notes || '',
      t.actual_hours || ''
    ];
  });

  sheet.getRange(2, 1, rows.length, 12).setValues(rows);

  // Summary row
  var sumRow = rows.length + 2;
  sheet.getRange(sumRow, 1, 1, 12).setValues([
    ['', 'TOTAL', '', '=SUM(D2:D' + (sumRow-1) + ')', '', '', '', '', '', '', '', '=SUM(L2:L' + (sumRow-1) + ')']
  ]);

  // Stamp the plan date in Config
  doSetConfig_('current_plan_date', new Date().toISOString().slice(0, 10));

  return {ok: true, count: rows.length};
}

/**
 * Write the full dashboard JSON blob to PlanJSON tab.
 */
function doWritePlanJson_(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('PlanJSON');
  if (!sheet) sheet = ss.insertSheet('PlanJSON');

  var parsed = typeof data === 'string' ? JSON.parse(data) : data;

  // Validate skill-format plans before storage
  if (parsed.tasks && !parsed.top) {
    var validation = validateSkillPlan_(parsed);
    if (!validation.valid) {
      Logger.log('Plan JSON validation failed: ' + JSON.stringify(validation.errors));
      // Still store it (don't block), but log the issues
    }
    parsed = validation.plan;
  }

  var jsonStr = JSON.stringify(parsed);
  sheet.getRange('A1').setValue(jsonStr);
  sheet.getRange('B1').setValue(new Date().toISOString());

  // Auto-archive: store plan under its date key in Config for history navigation
  // Prefer meta.date_key (clean YYYY-MM-DD) over parsing meta.date (fragile locale-dependent)
  var planDate = '';
  if (parsed.meta && parsed.meta.date_key && /^\d{4}-\d{2}-\d{2}$/.test(parsed.meta.date_key)) {
    planDate = parsed.meta.date_key;
  }
  if (!planDate && parsed.meta && parsed.meta.date) {
    // Fallback: parse "Thursday, March 5, 2026" or "Mar 5, 2026" into YYYY-MM-DD
    try {
      var d = new Date(parsed.meta.date.replace(/^[A-Za-z]+,\s*/, '') + ' 12:00:00');
      if (!isNaN(d.getTime())) planDate = d.toISOString().slice(0, 10);
    } catch(e) {}
  }
  if (!planDate && parsed.date) {
    // Dashboard format has date like "Wednesday, Mar 5, 2026"
    try {
      var d2 = new Date(parsed.date.replace(/^[A-Za-z]+,\s*/, '') + ' 12:00:00');
      if (!isNaN(d2.getTime())) planDate = d2.toISOString().slice(0, 10);
    } catch(e) {}
  }
  if (planDate) {
    var archiveKey = 'plan_' + planDate;

    // Past-plan immutability: archived plans for dates before today are snapshots.
    // Only overwrite if (a) the date is today or future, or (b) no archive exists yet.
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var isPast = planDate < today;
    var existingArchive = (readConfig_().config || {})[archiveKey];

    if (isPast && existingArchive) {
      Logger.log('Skipping archive overwrite for past date ' + planDate + ' — snapshot preserved');
    } else {
      doSetConfig_(archiveKey, jsonStr);
    }

    // Only update PlanJSON A1 (the "current" view) for today or future plans
    if (isPast) {
      // Restore PlanJSON A1 to today's plan (if one exists)
      var todayArchive = (readConfig_().config || {})['plan_' + today];
      if (todayArchive) {
        sheet.getRange('A1').setValue(todayArchive);
        Logger.log('Restored PlanJSON A1 to today (' + today + ') after past-date write');
      }
    }
  }

  return {ok: true, archived: !!planDate, date: planDate || 'unknown'};
}

/**
 * Update a task's status in the Today tab (also used by dashboard Mark Done).
 */
function doUpdateStatus_(taskTitle, newStatus) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Today');
  if (!sheet) return {ok: false, error: 'No Today sheet'};

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var taskCol = headers.indexOf('task');
  if (taskCol === -1) taskCol = headers.indexOf('title');
  var statusCol = headers.indexOf('status');
  if (taskCol === -1 || statusCol === -1) return {ok: false, error: 'Missing columns'};

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][taskCol]).trim() === String(taskTitle).trim()) {
      sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
      return {ok: true, row: i + 1};
    }
  }
  return {ok: false, error: 'Task not found: ' + taskTitle};
}

/**
 * Archive a day's tasks to History tab (append-only).
 */
function doArchiveDay_(planDate, tasks) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('History');
  if (!sheet) return {ok: false, error: 'No History tab'};

  if (!tasks || !tasks.length) return {ok: true, count: 0};

  var rows = tasks.map(function(t) {
    return [
      planDate,
      t.task || '',
      t.priority || '',
      t.est_hours || '',
      t.actual_hours || '',
      t.type || '',
      t.source || '',
      t.status || '',
      t.carried_over || false,
      t.notes || ''
    ];
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
  return {ok: true, count: rows.length};
}

/**
 * Log velocity metrics for a day.
 */
function doLogVelocity_(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Velocity');
  if (!sheet) return {ok: false, error: 'No Velocity tab'};

  var row = sheet.getLastRow() + 1;
  var vals = [
    data.date || new Date().toISOString().slice(0,10),
    data.tasks_planned || 0,
    data.tasks_completed || 0,
    data.tasks_deferred || 0,
    data.est_total_hours || 0,
    data.actual_total_hours || 0,
    '=IF(E' + row + '=0,0,F' + row + '/E' + row + ')',
    '=IF(B' + row + '=0,0,C' + row + '/B' + row + ')',
    data.plannable_hours || 0,
    '=IF(I' + row + '=0,0,F' + row + '/I' + row + ')'
  ];

  sheet.getRange(row, 1, 1, 10).setValues([vals]);
  return {ok: true, row: row};
}

/**
 * Update fields on a recurring task by name.
 */
function doUpdateRecurring_(taskName, updates) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Recurring');
  if (!sheet) return {ok: false, error: 'No Recurring tab'};

  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(taskName).trim()) {
      Object.keys(updates).forEach(function(key) {
        var col = headers.indexOf(key);
        if (col !== -1) {
          sheet.getRange(i + 1, col + 1).setValue(updates[key]);
        }
      });
      return {ok: true, row: i + 1};
    }
  }
  return {ok: false, error: 'Recurring task not found: ' + taskName};
}

/**
 * Set a config key-value pair.
 */
function doSetConfig_(key, value) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Config');
  if (!sheet) return {ok: false, error: 'No Config tab'};

  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(key).trim()) {
      sheet.getRange(i + 1, 2).setValue(value);
      return {ok: true, updated: true};
    }
  }
  // Key not found — append
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 3).setValues([[key, value, '']]);
  return {ok: true, updated: false, appended: true};
}


// ═══════════════════════════════════════════════════════════════
// GET Actions — Read Operations
// ═══════════════════════════════════════════════════════════════

function readToday_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Today');
  if (!sheet) return {ok: false, error: 'No Today tab', tasks: []};

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return {ok: true, tasks: []};

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var tasks = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] || !String(row[0]).match(/^\d+$/)) continue; // skip summary/empty rows
    var task = {};
    headers.forEach(function(h, j) { task[h] = row[j]; });
    tasks.push(task);
  }

  return {ok: true, tasks: tasks};
}

function readConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Config');
  if (!sheet) return {ok: false, error: 'No Config tab', config: {}};

  var data = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) config[String(data[i][0]).trim()] = data[i][1];
  }
  return {ok: true, config: config};
}

function readRecurring_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Recurring');
  if (!sheet) return {ok: false, error: 'No Recurring tab', tasks: []};

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return {ok: true, tasks: []};

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var tasks = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var task = {};
    headers.forEach(function(h, j) { task[h] = data[i][j]; });
    tasks.push(task);
  }

  return {ok: true, tasks: tasks};
}

function readVelocity_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Velocity');
  if (!sheet) return {ok: false, error: 'No Velocity tab', entries: []};

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return {ok: true, entries: []};

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var entries = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var entry = {};
    headers.forEach(function(h, j) { entry[h] = data[i][j]; });
    entries.push(entry);
  }

  return {ok: true, entries: entries};
}

/**
 * Read recent history entries, filtered to the last N days.
 * Returns tasks grouped by date, most recent first.
 */
function readHistory_(days) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('History');
  if (!sheet) return {ok: false, error: 'No History tab', tasks: [], dates: []};

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return {ok: true, tasks: [], dates: []};

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  var tasks = [];
  var dateSet = {};

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var rowDate = new Date(data[i][0]);
    if (isNaN(rowDate.getTime()) || rowDate < cutoff) continue;

    var task = {};
    headers.forEach(function(h, j) { task[h] = data[i][j]; });
    // Normalize date to YYYY-MM-DD string
    task['Date'] = rowDate.toISOString().slice(0, 10);
    tasks.push(task);
    dateSet[task['Date']] = true;
  }

  // Sort by date descending, then by original row order
  tasks.sort(function(a, b) { return b['Date'].localeCompare(a['Date']); });

  return {
    ok: true,
    tasks: tasks,
    dates: Object.keys(dateSet).sort().reverse(),
    days_queried: days
  };
}

function getSheetStatus_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var tabs = {};
  sheets.forEach(function(s) {
    tabs[s.getName()] = s.getLastRow();
  });
  var config = readConfig_().config || {};
  return {ok: true, tabs: tabs, spreadsheet_id: ss.getId(), url: ss.getUrl(), current_plan_date: config['current_plan_date'] || ''};
}


// ═══════════════════════════════════════════════════════════════
// Plan History Navigation
// ═══════════════════════════════════════════════════════════════

/**
 * Get a plan for a specific date from config archive.
 * Plans are stored as config keys: plan_YYYY-MM-DD
 */
function getPlanByDate_(dateStr) {
  var config = readConfig_().config || {};
  var key = 'plan_' + dateStr;
  var raw = config[key];
  if (!raw) return getEmptyPlan_();
  try {
    var plan = JSON.parse(raw);
    if (plan.tasks && !plan.top) {
      plan = convertSkillPlanToDashboard_(plan);
    }
    return plan;
  } catch(e) {
    Logger.log('getPlanByDate_ parse error for ' + dateStr + ': ' + e);
    return getEmptyPlan_();
  }
}

/**
 * Scan config keys to find all archived plan dates.
 * Returns sorted array of date strings: ["2026-03-04", "2026-03-05", ...]
 */
function getAvailablePlanDates_() {
  var config = readConfig_().config || {};
  var dates = [];
  for (var key in config) {
    if (key.indexOf('plan_') === 0 && key.length === 15) {  // plan_YYYY-MM-DD
      dates.push(key.substring(5));
    }
  }
  dates.sort();
  return dates;
}

// ═══════════════════════════════════════════════════════════════
// Dashboard Data Builder
// ═══════════════════════════════════════════════════════════════

function buildPlanData_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Preferred path: always serve PlanJSON when available (no date param = show latest plan).
  // The old freshness check used UTC which broke after 4pm PST. Since plans are actively
  // managed by the skill, just trust whatever is in PlanJSON — stale plans are handled
  // by the day-navigation UI, not by hiding them.
  var jsonSheet = ss.getSheetByName('PlanJSON');
  if (jsonSheet) {
    var jsonStr = jsonSheet.getRange('A1').getValue();
    if (jsonStr) {
      try {
        var parsed = JSON.parse(jsonStr);
        // If plan was saved in skill format (has 'tasks' but no 'top'), convert to dashboard format
        if (parsed.tasks && !parsed.top) {
          parsed = convertSkillPlanToDashboard_(parsed);
        }
        return parsed;
      } catch(e) {
        Logger.log('PlanJSON parse error, falling back: ' + e);
      }
    }
  }

  // Fallback: build from Today tab
  return buildFromTodayTab_(ss);
}

function buildFromTodayTab_(ss) {
  var sheet = ss.getSheetByName('Today');
  if (!sheet) return getEmptyPlan_();

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return getEmptyPlan_();

  var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var rows = data.slice(1).filter(function(r) { return r[0] !== ''; });
  var col = function(name) { return headers.indexOf(name); };

  var tasks = rows.map(function(r) {
    return {
      rank: r[col('#')] || r[col('rank')] || 0,
      title: r[col('task')] || r[col('title')] || '',
      priority: Number(r[col('priority')]) || 5,
      est: r[col('est. hours')] || r[col('est')] || r[col('estimate')] || '?',
      type: r[col('type')] || '',
      stream: r[col('stream')] || 'A',
      timeBlock: r[col('time block')] || r[col('time_block')] || '',
      source: r[col('source')] || '',
      sourceLink: r[col('source link')] || r[col('source_link')] || '',
      status: r[col('status')] || '',
      notes: r[col('notes')] || '',
      actualHours: r[col('actual hours')] || r[col('actual_hours')] || ''
    };
  }).filter(function(t) { return t.title; });

  tasks.sort(function(a, b) { return b.priority - a.priority; });

  var top = tasks.slice(0, 3).map(function(t, i) {
    return {
      rank: i + 1,
      title: t.title,
      color: i === 0 ? 'purple-tint' : i === 1 ? 'gold-tint' : 'sage',
      nudge: (String(t.notes).toLowerCase().indexOf('carried') !== -1 || String(t.notes).toLowerCase().indexOf('carry') !== -1) ? 'carried over' : null,
      est: typeof t.est === 'number' ? t.est + 'h' : String(t.est),
      stream: t.stream,
      source: t.source,
      source_link: t.sourceLink || null,
      meta: t.notes || t.status || '',
      detail: { context: t.notes || '' }
    };
  });

  var colors = ['slate','lavender','sage','sand','gold-tint','purple-tint'];
  var more = tasks.slice(3).map(function(t, i) {
    return {
      title: t.title,
      color: colors[i % colors.length],
      est: typeof t.est === 'number' ? t.est + 'h' : String(t.est),
      stream: t.stream,
      source: t.source,
      source_link: t.sourceLink || null,
      meta: t.notes || t.status || '',
      detail: { context: t.notes || '' }
    };
  });

  var config = readConfig_().config || {};
  var plannableHours = Number(config.work_hours_per_day || 8) - Number(config.buffer_minutes || 30) / 60;

  var totalEst = tasks.reduce(function(sum, t) {
    var h = parseFloat(t.est);
    return sum + (isNaN(h) ? 0 : h);
  }, 0);

  var capacity = totalEst <= plannableHours ? 'green' : totalEst <= plannableHours * 1.2 ? 'amber' : 'red';
  var capacityLabel = capacity === 'green' ? 'Balanced' : capacity === 'amber' ? 'Tight' : 'Overloaded';

  var today = new Date();
  var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return {
    date: dayNames[today.getDay()] + ', ' + monthNames[today.getMonth()] + ' ' + today.getDate() + ', ' + today.getFullYear(),
    generated: Utilities.formatDate(today, Session.getScriptTimeZone(), 'h:mm a z'),
    plannable_hours: Math.round(plannableHours * 10) / 10,
    capacity: capacity,
    capacity_label: capacityLabel,
    top: top,
    more: more,
    email_highlights: [],
    possibly_overlooked: [],
    timeline: [],
    stats: [
      { value: totalEst.toFixed(1) + 'h', label: 'Planned' },
      { value: String(tasks.filter(function(t) { return t.stream !== 'A'; }).length), label: 'AI Tasks' },
      { value: tasks.filter(function(t) { return t.status === 'Done'; }).length + '/' + tasks.length, label: 'Done' },
      { value: plannableHours + 'h', label: 'Available' }
    ],
    notes: [
      { title: 'Data Sources', content: 'Dashboard built from Today tab. For full detail, run the daily planner skill to populate PlanJSON.' }
    ]
  };
}

/**
 * Validate a skill-format plan JSON before conversion or storage.
 * Fixes common issues in-place and returns {valid, errors[], warnings[], plan}.
 *
 * Required skill JSON structure:
 *   meta: { date, date_key, generated, plannable_hours, capacity, capacity_label }
 *   tasks[]: { task, priority, est_hours, type, stream, source, ... }
 *   more_tasks[]?: same shape as tasks, lower priority
 *   timeline[]?: { time, task, note, bar_color, duration, parallel?, meeting? }
 *   stats[]?: { value, label }
 *   email_highlights[]?: { subject, from, snippet, tag, link? }
 *   possibly_overlooked[]?: { subject, from, snippet, tag, link? }
 *   notes[]?: { title, content }
 */
function validateSkillPlan_(plan) {
  var errors = [];
  var warnings = [];

  // ── meta ──
  if (!plan.meta || typeof plan.meta !== 'object') {
    errors.push('Missing or invalid meta object');
    plan.meta = {};
  }
  var m = plan.meta;
  if (!m.date)            warnings.push('meta.date missing — header will show fallback date');
  if (!m.date_key)        warnings.push('meta.date_key missing — date archiving may use fragile Date parse');
  if (m.plannable_hours == null) warnings.push('meta.plannable_hours missing — will use config default');
  if (!m.generated)       warnings.push('meta.generated missing — will show server time');
  if (!m.capacity)      { m.capacity = 'green';     warnings.push('meta.capacity defaulted to green'); }
  if (!m.capacity_label){ m.capacity_label = 'Balanced'; warnings.push('meta.capacity_label defaulted'); }

  // ── tasks ──
  if (!Array.isArray(plan.tasks)) {
    errors.push('tasks must be an array (got ' + typeof plan.tasks + ')');
    plan.tasks = [];
  }
  plan.tasks.forEach(function(t, i) {
    var label = 'tasks[' + i + ']';
    if (!t.task && !t.title)  errors.push(label + ' missing task name (need "task" or "title" key)');
    if (!t.task && t.title) { t.task = t.title; warnings.push(label + ' used "title" as "task" — prefer "task" key'); }
    if (t.priority == null)   warnings.push(label + ' missing priority — will sort to bottom');
    if (t.est_hours == null && t.est == null) warnings.push(label + ' missing est_hours — will show "?"');
    if (!t.stream)          { t.stream = 'A'; }
    if (!t.source)            warnings.push(label + ' missing source');
    if (!t.source_link)       warnings.push(label + ' missing source_link — title will not be clickable');
  });

  // ── more_tasks ──
  if (plan.more_tasks !== undefined && !Array.isArray(plan.more_tasks)) {
    warnings.push('more_tasks is not an array — coercing to empty');
    plan.more_tasks = [];
  }
  (plan.more_tasks || []).forEach(function(t, i) {
    var label = 'more_tasks[' + i + ']';
    if (!t.task && !t.title)  warnings.push(label + ' missing task name');
    if (!t.task && t.title) { t.task = t.title; }
  });

  // ── section arrays ──
  ['timeline','stats','email_highlights','possibly_overlooked','notes'].forEach(function(key) {
    if (plan[key] !== undefined && !Array.isArray(plan[key])) {
      warnings.push(key + ' is not an array — coercing');
      plan[key] = [];
    }
  });

  // ── email_highlights & possibly_overlooked link warnings ──
  (plan.email_highlights || []).forEach(function(e, i) {
    if (!e.link) warnings.push('email_highlights[' + i + '] missing link — subject will not be clickable');
  });
  (plan.possibly_overlooked || []).forEach(function(e, i) {
    if (!e.link) warnings.push('possibly_overlooked[' + i + '] missing link — subject will not be clickable');
  });

  // ── timeline items ──
  (plan.timeline || []).forEach(function(t, i) {
    if (!t.time) warnings.push('timeline[' + i + '] missing time');
    if (!t.task) warnings.push('timeline[' + i + '] missing task');
  });

  // ── stats items ──
  (plan.stats || []).forEach(function(s, i) {
    if (s.value == null) warnings.push('stats[' + i + '] missing value');
    if (!s.label) warnings.push('stats[' + i + '] missing label');
  });

  // Log to Apps Script for debugging
  if (errors.length) Logger.log('Plan validation ERRORS: ' + JSON.stringify(errors));
  if (warnings.length) Logger.log('Plan validation warnings: ' + JSON.stringify(warnings));

  return { valid: errors.length === 0, errors: errors, warnings: warnings, plan: plan };
}

/**
 * Convert skill-format plan (with 'tasks' array) to dashboard-format (with 'top'/'more').
 * Skill plans have: meta, tasks[], more_tasks[], timeline[], stats[], notes[],
 *                   email_highlights[], possibly_overlooked[]
 * Dashboard expects: date, generated, plannable_hours, capacity, capacity_label, top[], more[],
 *                    timeline[], stats[], notes[], email_highlights[], possibly_overlooked[]
 */
function convertSkillPlanToDashboard_(plan) {
  // Validate and fix common issues before conversion
  var validation = validateSkillPlan_(plan);
  plan = validation.plan;
  var meta = plan.meta || {};
  // Merge tasks and more_tasks, then sort by priority
  var allTasks = (plan.tasks || []).concat(plan.more_tasks || []);
  allTasks.sort(function(a, b) { return (b.priority || 0) - (a.priority || 0); });

  var topColors = ['purple-tint', 'gold-tint', 'sage'];
  var moreColors = ['slate','lavender','sage','sand','gold-tint','purple-tint'];

  // Helper to format estimate — skill uses est_hours (number), not est_minutes
  function fmtEst(t) {
    if (t.est_hours) return t.est_hours + 'h';
    if (t.est) return String(t.est);
    if (t.est_minutes) return (t.est_minutes / 60).toFixed(1) + 'h';
    return '?';
  }

  // Helper to convert a skill task to dashboard card
  function toCard(t, i, colors) {
    return {
      rank: i + 1,
      title: t.task || t.title || '',
      color: t.color || colors[i % colors.length] || 'gold-tint',
      nudge: t.nudge || null,
      est: fmtEst(t),
      stream: t.stream || 'A',
      source: t.source || '',
      source_link: t.source_link || null,
      meta: t.time_block || t.notes || '',
      detail: {
        context: t.context || t.notes || '',
        acceptance: t.acceptance || [],
        decision: t.decision || null,
        ai_help: t.ai_help || null
      }
    };
  }

  var top = allTasks.slice(0, 3).map(function(t, i) { return toCard(t, i, topColors); });
  var more = allTasks.slice(3).map(function(t, i) { return toCard(t, i, moreColors); });

  // Build date string from meta — skill format uses meta.date (e.g., "Thursday, March 5, 2026")
  var dateStr = meta.date || '';
  if (!dateStr) {
    var today = new Date();
    var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    dateStr = dayNames[today.getDay()] + ', ' + monthNames[today.getMonth()] + ' ' + today.getDate() + ', ' + today.getFullYear();
  }

  var config = readConfig_().config || {};
  var plannableHours = meta.plannable_hours || meta.available_hours || (Number(config.work_hours_per_day || 8) - Number(config.buffer_minutes || 30) / 60);

  return {
    date: dateStr,
    generated: meta.generated || meta.generated_at || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'h:mm a z'),
    plannable_hours: Math.round(plannableHours * 10) / 10,
    capacity: meta.capacity || 'green',
    capacity_label: meta.capacity_label || meta.note || 'Balanced',
    top: top,
    more: more,
    email_highlights: plan.email_highlights || [],
    possibly_overlooked: plan.possibly_overlooked || [],
    timeline: plan.timeline || [],
    stats: plan.stats || [],
    notes: plan.notes || [],
    meetings: plan.meetings || []
  };
}

function getEmptyPlan_() {
  var today = new Date();
  var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return {
    date: dayNames[today.getDay()] + ', ' + monthNames[today.getMonth()] + ' ' + today.getDate(),
    generated: 'Not yet generated',
    plannable_hours: 0,
    capacity: 'amber',
    capacity_label: 'No Plan Yet',
    top: [],
    more: [],
    email_highlights: [],
    possibly_overlooked: [],
    timeline: [],
    stats: [
      { value: '0h', label: 'Planned' },
      { value: '0', label: 'AI Tasks' },
      { value: '0/0', label: 'Done' },
      { value: '8h', label: 'Available' }
    ],
    notes: []
  };
}

function isToday_(timestamp) {
  if (!timestamp) return false;
  var d = new Date(timestamp);
  var now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate();
}

// Legacy aliases (dashboard Mark Done still calls these directly)
function updateTaskStatus(taskTitle, newStatus) {
  return doUpdateStatus_(taskTitle, newStatus);
}
function writePlanJson(jsonString) {
  return doWritePlanJson_(jsonString);
}
