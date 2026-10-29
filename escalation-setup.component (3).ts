import { Validators, UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { LocationStrategy } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import { AuthenticationService } from '@app/_services/authentication.service';
import { EscalationSetupService } from '@app/_services/escalationsetup.service';
import { SusPectService } from '@app/_services/suspect.service';
import { ToastrService } from 'ngx-toastr';

@Component({
    selector: 'app-escalation-setup',
    templateUrl: './escalation-setup.component.html',
    styleUrls: ['./escalation-setup.component.css'],
    standalone: false
})
export class EscalationSetupComponent implements OnInit {

  constructor(private activatedRoute: ActivatedRoute, private Location: LocationStrategy, private authService: AuthenticationService,
    public escalationService: EscalationSetupService, private susPectService: SusPectService, private toastr: ToastrService,
    private cd: ChangeDetectorRef, private sanitizer: DomSanitizer) {
    this.ishowhide = sessionStorage.getItem('IsReadOnly') ? JSON.parse(sessionStorage.getItem('IsReadOnly')) : false;
    this.ALLPortfolio = sessionStorage.getItem('AllPortfolio') ? JSON.parse(sessionStorage.getItem('AllPortfolio')) : [];
    this.UserPortfolios = sessionStorage.getItem('UserPortfolios') ? sessionStorage.getItem('UserPortfolios') : "";
  }

  ngOnInit() {
    history.pushState(null, null, window.location.href);
    this.Location.onPopState(() => {
      history.pushState(null, null, window.location.href);
    });
  }

  public message;
  public ishowhide = false;
  public ALLPortfolio = [];
  public UserPortfolios = "";

  public activeView: 'config' | 'overview' = 'config';
  public overviewRows: any[] = [];
  public overviewLoading = false;

  public previewVisible = false;
  public previewSubject = '';
  public previewHtml: SafeHtml = '';
  public htmlEditor: any;

  public leaveVisible = false;
  public bodyDirty = false;
  private pendingAction: (() => void) | null = null;
  private pendingRevert: (() => void) | null = null;
  private reverting = false;

  public addingTag = false;
  public newTag = '';
  public usingDefaultTags = false;

  variablesoption: { text: string }[] = [];

  public typeCards = [
    { value: 'Analyst', title: 'Analyst Emails', desc: 'Analyst not online during monitoring hours.', icon: 'fa fa-user', tone: 'tone-analyst' },
    { value: 'Case', title: 'Case Emails', desc: 'Too many new cases waiting in an analyst bucket.', icon: 'fa fa-folder-open', tone: 'tone-case' },
    { value: 'Datasource', title: 'Datasource Emails', desc: 'No suspects received, or cases delayed for a datasource.', icon: 'fa fa-database', tone: 'tone-datasource' }
  ];

  public datasourceescalationtype = [{ value: 1, Name: 'No Suspect' }, { value: 2, Name: 'Case Delay' }];
  public datasourceModels = [
    { value: 'Prevention', Name: 'Prevention' },
    { value: 'Detection', Name: 'Detection' },
    { value: 'AI', Name: 'AI' }
  ];
  public selecteddatasourcemodel;
  public modelPortfolios = [];
  public escalation = [{ value: "Analyst", Name: 'Analyst Emails' }, { value: "Case", Name: "Case Emails" }, { value: "Datasource", Name: "Datasource Emails" }];
  statusArray = [{ value: true, Name: "Active" }, { value: false, Name: "InActive" }];
  escalationlevel = [{ value: 1, Name: "Level 1" }, { value: 2, Name: "Level 2" }];
  public isdatasource: boolean = false;
  public isanalyst: boolean = false;
  public iscase: boolean = false;
  public isselecteddatasource: boolean = false;
  public isanalystlevel: boolean = false;
  public iscaselevel: boolean = false;
  public isdatasourceesctype: boolean = false;
  public isdelayduration = false;
  public isnosuspect = false;
  public reportdata;
  public storedemails;
  public selectedescalation;
  public selectedescalationlevel;
  public portfolios;
  public olddata;

  public escalationdata;
  public escalationemaildata;
  public emailbodycontent;
  public selectedescalations;
  public showgrid: boolean = false;
  public selectedescalationtype;
  public selecteddatasource;
  public selecteddatasourceesctype;
  public existingEmails: string[];
  public escalationselection: number | null = null;

  public delaytitle;

  EscalationForm = new UntypedFormGroup({
    Id: new UntypedFormControl(''),
    type: new UntypedFormControl(''),
    level: new UntypedFormControl(''),
    emailsubject: new UntypedFormControl('', Validators.required),
    emailbody: new UntypedFormControl(''),
    constantBody: new UntypedFormControl(''),
    peak: new UntypedFormControl(0),
    offpeak: new UntypedFormControl(0),
    status: new UntypedFormControl(false),
    delay: new UntypedFormControl(0),
    dstatus: new UntypedFormControl(false),
  });

  get showForm(): boolean {
    return this.isselecteddatasource || this.iscaselevel || this.isanalystlevel;
  }

  get statusControlName(): string {
    return this.isdelayduration ? 'dstatus' : 'status';
  }

  get isStatusOn(): boolean {
    return !!this.EscalationForm.get(this.statusControlName)?.value;
  }

  get recipientCount(): number {
    return (this.reportdata || []).filter(r => r.status).length;
  }

  get recipientTitle(): string {
    return (this.isanalystlevel || this.iscaselevel) ? 'Recipients (Level ' + this.selectedescalationlevel + ')' : 'Recipients';
  }

  onStatusToggle(e: Event) {
    if (!(e.target as HTMLInputElement).checked) {
      this.toastr.warning('No emails will be sent until you turn it on.', 'Escalation Inactive');
    }
  }

  get infoText(): string {
    switch (this.selectedescalation) {
      case 'Analyst': return 'Sends an email to your team when no analyst has been online for the time you set.';
      case 'Case': return 'Sends an email when an analyst bucket holds more new cases than the limit you set.';
      case 'Datasource': return 'Sends an email when a datasource has not produced suspects, or when its cases are delayed.';
      default: return 'Set up automatic emails that are sent when a limit is crossed. Start by choosing what you want to monitor.';
    }
  }

  get triggerCaption(): string {
    if (this.isanalystlevel) { return 'Time with no analyst online'; }
    if (this.iscaselevel) { return 'Number of new cases in a bucket'; }
    if (this.isnosuspect) { return 'Time with no suspect received'; }
    return 'Time a case stays delayed';
  }

  get peakLabel(): string {
    if (this.isanalystlevel) { return 'Analyst Offline (Peak Hours)'; }
    if (this.iscaselevel) { return 'New Cases (Peak Hours)'; }
    return 'No Suspect (Peak Hours)';
  }

  get offPeakLabel(): string {
    if (this.isanalystlevel) { return 'Analyst Offline (Off Peak Hours)'; }
    if (this.iscaselevel) { return 'New Cases (Off Peak Hours)'; }
    return 'No Suspect (Off Peak Hours)';
  }

  get peakHelp(): string {
    const window = 'Peak hours are 7:00 AM - 11:00 PM. ';
    if (this.isanalystlevel) { return window + 'Sends the email when no analyst is online for this long.'; }
    if (this.iscaselevel) { return window + "Sends the email when an analyst's bucket reaches this many new cases."; }
    return window + 'Sends the email when no suspect case arrives for this long.';
  }

  get offPeakHelp(): string {
    const window = 'Off-peak hours are 11:00 PM - 7:00 AM. ';
    if (this.isanalystlevel) { return window + 'Sends the email when no analyst is online for this long.'; }
    if (this.iscaselevel) { return window + "Sends the email when an analyst's bucket reaches this many new cases."; }
    return window + 'Sends the email when no suspect case arrives for this long.';
  }

  get recipientStatusCaption(): string {
    const first = this.selectedescalations && this.selectedescalations[0];
    if (first && (first.escalationType === 'Analyst' || first.escalationType === 'Case')) {
      return 'Receives Level ' + first.escalationLevel;
    }
    return 'Status';
  }

  limitFor(field: string): { min: number, max: number, unit: string } {
    if (field === 'delay') { return { min: 1, max: 600, unit: 'min' }; }
    if (this.iscaselevel) { return { min: 100, max: 5000, unit: 'cases' }; }
    if (this.isanalystlevel) { return { min: 1, max: 600, unit: 'min' }; }
    return { min: 10, max: 5000, unit: 'min' };
  }

  validateRange(event: Event, controlName: string): void {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    const maxValue = this.limitFor(controlName).max;

    let fixed: number | null = null;
    if (isNaN(value) || value <= 0) {
      fixed = 1;
    } else if (value > maxValue) {
      fixed = maxValue;
    }

    if (fixed !== null) {
      input.value = fixed.toString();
      this.EscalationForm.get(controlName)?.setValue(fixed);
    }
  }

  setView(view: 'config' | 'overview') {
    this.activeView = view;
    if (view === 'overview') {
      this.loadOverview();
    }
  }

  loadOverview() {
    this.overviewLoading = true;
    forkJoin([this.escalationService.GetEscalations(), this.escalationService.GetEscalationsEmail()]).subscribe({
      next: ([esc, mail]: any[]) => {
        const emails = mail.data || [];
        this.overviewRows = (esc.data || []).map(x => {
          const levelFlag = x.escalationLevel === 1 ? 'islevelone' : 'isleveltwo';
          return {
            escalationID: x.escalationID,
            escalationType: x.escalationType,
            escalationLevel: x.escalationLevel,
            typeLabel: this.typeLabelOf(x.escalationType),
            levelLabel: this.levelLabelOf(x),
            condition: this.conditionOf(x),
            recipients: emails.filter(m => m.escalationType === x.escalationType && m[levelFlag]).length,
            active: x.escalationType === 'Analyst' || x.escalationType === 'Case' || x.escalationLevel === 1 ? !!x.status : !!x.delayStatus
          };
        });
        this.overviewLoading = false;
      },
      error: () => {
        this.overviewLoading = false;
        this.toastr.error('Unable to load escalations.');
      }
    });
  }

  startAddTag() { this.addingTag = true; this.newTag = ''; }
  cancelAddTag() { this.addingTag = false; this.newTag = ''; }

  confirmAddTag() {
    const tag = (this.newTag || '').trim();
    if (!tag) { return; }
    if (/[\s,]/.test(tag)) { this.toastr.error('Tag cannot contain spaces or commas.'); return; }
    if (this.variablesoption.some(v => v.text.trim().toLowerCase() === tag.toLowerCase())) {
      this.toastr.error('Tag already exists.');
      return;
    }

    const id = this.EscalationForm.get('Id').value;

    if (!this.showgrid || !id) {
      const all = [tag, ...this.variablesoption.map(v => v.text.trim())];
      this.variablesoption = all.map(t => ({ text: t }));
      this.EscalationForm.get('constantBody').setValue(all.join(','));
      this.EscalationForm.markAsDirty();
      this.newTag = '';
      return;
    }

    this.escalationService.AddEscalationTag({ EscalationID: id, ConstantBody: tag }).subscribe(res => {
      if (res.error) { this.toastr.error(res.message); return; }
      this.toastr.success(res.message);
      this.refreshTags();
    });
  }

  refreshTags() {
    this.escalationService.GetEscalations().subscribe(esc => {
      this.escalationdata = esc.data;
      const id = this.EscalationForm.get('Id').value;
      const current = esc.data.find(x => x.escalationID === id);
      if (current) {
        this.EscalationForm.get('constantBody').setValue(current.constantBody || '');
        this.setVariables();
      }
      this.newTag = '';
    });
  }

  typeLabelOf(type: string): string {
    if (type === 'Analyst') { return 'Analyst Emails'; }
    if (type === 'Case') { return 'Case Emails'; }
    return 'Datasource: ' + type;
  }

  levelLabelOf(x: any): string {
    if (x.escalationType === 'Analyst' || x.escalationType === 'Case') { return 'Level ' + x.escalationLevel; }
    return x.escalationLevel === 1 ? 'No Suspect' : 'Case Delay';
  }

  conditionOf(x: any): string {
    if (x.escalationType === 'Analyst') {
      return 'Offline > ' + x.peakCountOrDuration + ' min (peak) / ' + x.offPeakCountOrDuration + ' min (off-peak)';
    }
    if (x.escalationType === 'Case') {
      return '> ' + x.peakCountOrDuration + ' cases (peak) / ' + x.offPeakCountOrDuration + ' cases (off-peak)';
    }
    if (x.escalationLevel === 1) {
      return 'No suspect for ' + x.peakCountOrDuration + ' min (peak) / ' + x.offPeakCountOrDuration + ' min (off-peak)';
    }
    return 'Delayed > ' + x.delayDuration + ' min';
  }

  editRow(row: any) {
    this.activeView = 'config';
    if (row.escalationType === 'Analyst' || row.escalationType === 'Case') {
      this.onChangeEscalation({ value: row.escalationType });
      this.setLevel(row.escalationLevel);
    } else {
      this.onChangeEscalation({ value: 'Datasource' });
      const portfolio = this.ALLPortfolio.find(x => x.value === row.escalationType || x.Name === row.escalationType);
      this.onChangeDatasourceModel({ value: this.modelOf(portfolio) || 'Detection' });
      this.onChangeDatasource({ value: row.escalationType });
      this.setDatasourceTrigger(row.escalationLevel);
    }
  }

  onChangeEscalation(e) {

    this.selectedescalation = e.value;
    this.selectedescalations = '';
    this.escalationselection = null;
    this.selectedescalationlevel = 0;
    this.selecteddatasource = null;
    this.selecteddatasourcemodel = null;
    this.modelPortfolios = [];
    this.selecteddatasourceesctype = '';
    this.emailbodycontent = '';
    this.reportdata = null;
    this.showgrid = false;
    this.iscaselevel = false;
    this.isanalystlevel = false;
    this.isselecteddatasource = false;
    this.isdatasourceesctype = false;
    this.isdelayduration = false;
    this.isnosuspect = false;

    if (e.value == 'Datasource') {

      this.isdatasource = true;
      this.isanalyst = false;
      this.iscase = false;
      this.delaytitle = "Escalates Email after certain minutes."
    }
    else if (e.value == 'Analyst') {

      this.portfolios = [{ value: 'Analyst', Name: 'Analyst' }];

      this.isdatasource = false;
      this.isanalyst = true;
      this.iscase = false;
      this.isdatasourceesctype = false;

    }
    else if (e.value == 'Case') {

      this.portfolios = [{ value: 'Case', Name: 'Case' }];

      this.isdatasource = false;
      this.isanalyst = false;
      this.iscase = true;
      this.isdatasourceesctype = false;
    }
  }

  setLevel(level: number) {
    this.escalationselection = level;
    this.onChangeEscalationlevel({ value: level });
  }

  setDatasourceTrigger(value: number) {
    this.selecteddatasourceesctype = value;
    this.onChangeDatasourceEscType({ value: value });
  }

  onChangeEscalationlevel(e) {

    if (!this.escalationselection) {
      return;
    }

    this.escalationService.GetEscalations().subscribe(esc => {

      this.escalationdata = esc.data;

      if (this.isanalyst) {
        this.showgrid = true;
        this.isanalystlevel = true;
        this.iscaselevel = false;
        this.selectedescalationtype = 'Analyst';
      }
      else if (this.iscase) {
        this.showgrid = true;
        this.isanalystlevel = false;
        this.iscaselevel = true;
        this.selectedescalationtype = 'Case';
      }
      else {
        return;
      }

      this.loadLevel(e.value);
    });
  }

  loadLevel(level: number) {

    setTimeout(() => {

      this.selectedescalationlevel = level;
      this.selectedescalations = this.escalationdata.filter(item => item.escalationType === this.selectedescalationtype && item.escalationLevel === level);

      if (this.selectedescalations.length == 0) {
        this.AllNewValue();
        this.showgrid = false;
        return;
      }

      this.patchFromSelected();
      this.markClean();
      this.cd.detectChanges();
      this.retriveemail();

    }, 0);
  }

  patchFromSelected() {

    const selected = this.selectedescalations[0];

    this.EscalationForm.patchValue({
      Id: selected.escalationID,
      type: selected.escalationType,
      level: selected.escalationLevel,
      emailsubject: selected.emailSubject,
      emailbody: selected.emailBody,
      constantBody: selected.constantBody,
      peak: selected.peakCountOrDuration,
      offpeak: selected.offPeakCountOrDuration,
      status: selected.status,
      delay: selected.delayDuration,
      dstatus: selected.delayStatus
    });

    this.emailbodycontent = this.EscalationForm.get("emailbody").value;
    this.setVariables();
  }

  setVariables() {
    let constant = this.EscalationForm.get("constantBody").value;
    this.usingDefaultTags = false;

    if (!constant) {
      const isSpecial = (t: string) => t === 'Analyst' || t === 'Case';
      const list = this.escalationdata || [];
      const sibling = list.find(x => x.constantBody && x.escalationType === this.selectedescalationtype)
        || (isSpecial(this.selectedescalationtype) ? null
          : list.find(x => x.constantBody && !isSpecial(x.escalationType) && x.escalationLevel === this.selectedescalationlevel));

      if (sibling) {
        constant = sibling.constantBody;
      } else {
        constant = this.defaultTags();
        this.usingDefaultTags = true;
      }
    }

    this.variablesoption = constant ? constant.split(',').map(value => ({ text: value })).filter(v => v.text.trim()) : [];
  }

  defaultTags(): string {
    switch (this.selectedescalationtype) {
      case 'Analyst': return '{Analyst_Name},{Offline_Duration},{Queue_Name},{Timestamp},{Escalation_Level}';
      case 'Case': return '{Analyst_Name},{Case_Count},{Queue_Name},{Timestamp},{Escalation_Level}';
      default: return '{Datasource_Name},{Delay_Duration},{Case_Count},{Timestamp}';
    }
  }

  onEditorInit(e) {
    this.htmlEditor = e.component;
    try {
      e.component.getQuillInstance().on('text-change', (delta, old, source) => {
        if (source === 'user') { this.bodyDirty = true; }
      });
    } catch (error) {
    }
  }

  insertVariable(text: string) {
    const tag = text.trim();
    try {
      const quill = this.htmlEditor && this.htmlEditor.getQuillInstance();
      if (quill) {
        const range = quill.getSelection(true);
        const index = range ? range.index : quill.getLength();
        quill.insertText(index, tag, 'user');
        quill.setSelection(index + tag.length, 0);
        return;
      }
    } catch (error) {
    }
    this.emailbodycontent = (this.emailbodycontent || '') + tag;
    this.cd.detectChanges();
  }

  describeTag(tag: string): string {
    const t = (tag || '').toLowerCase();
    if (t.includes('duration') || t.includes('minute') || t.includes('offline')) { return 'Replaced with how long the condition has lasted, for example "35 minutes".'; }
    if (t.includes('analyst') || t.includes('user')) { return "Replaced with the analyst's name, for example \"Ali Khan\"."; }
    if (t.includes('queue') || t.includes('bucket')) { return 'Replaced with the queue or bucket name.'; }
    if (t.includes('count') || t.includes('case')) { return 'Replaced with the number of cases, for example "120".'; }
    if (t.includes('time') || t.includes('date')) { return 'Replaced with the date and time when the email is sent.'; }
    if (t.includes('level')) { return 'Replaced with the escalation level, for example "Level 1".'; }
    if (t.includes('branch')) { return 'Replaced with the branch name.'; }
    if (t.includes('datasource') || t.includes('portfolio')) { return 'Replaced with the datasource name.'; }
    return 'Replaced with real data when the email is sent.';
  }

  sampleFor(tag: string): string {
    const t = (tag || '').toLowerCase();
    if (t.includes('duration') || t.includes('minute') || t.includes('offline')) { return '35 minutes'; }
    if (t.includes('analyst') || t.includes('user')) { return 'Ali Khan'; }
    if (t.includes('queue') || t.includes('bucket')) { return 'High Risk Queue'; }
    if (t.includes('count') || t.includes('case')) { return '120'; }
    if (t.includes('time') || t.includes('date')) { return new Date().toLocaleString(); }
    if (t.includes('level')) { return 'Level ' + (this.selectedescalationlevel || 1); }
    if (t.includes('branch')) { return 'Main Branch'; }
    if (t.includes('datasource') || t.includes('portfolio')) { return this.selecteddatasource || 'Datasource'; }
    return 'Sample value';
  }

  openPreview() {
    let subject = this.EscalationForm.get('emailsubject').value || '';
    let body = this.emailbodycontent || '';

    for (const v of this.variablesoption) {
      const tag = (v.text || '').trim();
      if (!tag) { continue; }
      const sample = this.sampleFor(tag);
      subject = subject.split(tag).join(sample);
      body = body.split(tag).join('<mark style="background:#dbeafe;padding:0 3px;border-radius:3px">' + sample + '</mark>');
    }

    this.previewSubject = subject;
    this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(body);
    this.previewVisible = true;
  }

  withTableBorders(html: string): string {
    if (!html) { return html; }
    const cell = 'border:1px solid #64748b;padding:6px 10px;';
    return html
      .replace(/<table(?![^>]*\sstyle=)/gi, '<table style="border-collapse:collapse;"')
      .replace(/<(td|th)(?![^>]*\sstyle=)/gi, '<$1 style="' + cell + '"');
  }

  defaultSubject(): string {
    const level = this.selectedescalationlevel;
    switch (this.selectedescalationtype) {
      case 'Analyst': return '[URGENT] Analyst Offline Alert - Level ' + level;
      case 'Case': return '[ALERT] High Number of New Cases - Level ' + level;
      default:
        return level === 1
          ? '[ALERT] No Suspect Received - ' + this.selectedescalationtype
          : '[ALERT] Case Delayed - ' + this.selectedescalationtype;
    }
  }

  defaultBody(): string {
    const type = this.selectedescalationtype;
    const level = this.selectedescalationlevel;
    let what = '';

    if (type === 'Analyst') {
      what = 'This is an automated alert from eSentinel. No analyst has been online for longer than the allowed time.';
    } else if (type === 'Case') {
      what = 'This is an automated alert from eSentinel. The number of new cases waiting in an analyst bucket has crossed the allowed limit.';
    } else if (level === 1) {
      what = 'This is an automated alert from eSentinel. No suspect case has been received from this datasource within the allowed time.';
    } else {
      what = 'This is an automated alert from eSentinel. A case from this datasource has been delayed beyond the allowed time.';
    }

    const cell = 'border:1px solid #cbd5e1;padding:6px 10px;';
    const typeText = this.typeLabelOf(type);
    const levelText = this.levelLabelOf({ escalationType: type, escalationLevel: level });

    return '<p>Dear Team,</p>'
      + '<p>' + what + '</p>'
      + '<table style="border-collapse:collapse;width:100%">'
      + '<tr><td style="' + cell + 'font-weight:bold">Escalation</td><td style="' + cell + '">' + typeText + '</td></tr>'
      + '<tr><td style="' + cell + 'font-weight:bold">Level / Trigger</td><td style="' + cell + '">' + levelText + '</td></tr>'
      + '<tr><td style="' + cell + 'font-weight:bold">Action required</td><td style="' + cell + '">Please check and take action as soon as possible.</td></tr>'
      + '</table>'
      + '<p>Regards,<br>eSentinel Fraud Management System</p>';
  }

  retriveemail() {
    this.escalationService.GetEscalationsEmail().subscribe(email => {

      this.escalationemaildata = email.data;

      var escalationemail = this.escalationemaildata.filter(item => item.escalationType === this.selectedescalations[0].escalationType);

      this.reportdata = escalationemail.map(email => ({
        emailID: email.emailID,
        email: email.email,
        status: this.selectedescalations[0].escalationLevel === 1 ? email.islevelone : email.isleveltwo,
        escalationID: email.escalationID,
        escalationType: email.escalationType,
        dstatus: email.status,
        islevelone: email.islevelone,
        isleveltwo: email.isleveltwo,
      }));

      this.existingEmails = this.reportdata.map(item => item.email);

    });
  }

  onChangeDatasource(e) {
    this.selecteddatasource = e.value;
    this.selecteddatasourceesctype = '';
    this.isdatasourceesctype = true;
    this.isselecteddatasource = false;
    this.selectedescalationtype = e.value;

  }

  onChangeDatasourceEscType(e) {

    this.selectedescalationlevel = e.value;

    if (this.selectedescalationlevel == 1) { this.isselecteddatasource = true; this.isnosuspect = true; this.isdelayduration = false; }
    else if (this.selectedescalationlevel == 2) { this.isselecteddatasource = true; this.isnosuspect = false; this.isdelayduration = true; }

    this.escalationService.GetEscalations().subscribe(datasource => {

      this.escalationdata = datasource.data;
      this.selectedescalations = datasource.data.filter(item => item.escalationType === this.selectedescalationtype && item.escalationLevel === this.selectedescalationlevel);

      this.portfolios = this.ALLPortfolio.filter(item => item.Name == this.selectedescalationtype);

      if (this.selectedescalations.length == 0) {
        this.AllNewValue();
        this.markClean();
        this.showgrid = false;
        return 0;
      }

      this.showgrid = true;

      setTimeout(() => {

        this.patchFromSelected();
        this.cd.detectChanges();
        this.retriveemail();

      }, 0);

    });

  }

  AddEscalation() {

    let model =
    {
      escalationType: this.selectedescalationtype,
      EscalationLevel: this.selectedescalationlevel,
      EmailSubject: this.EscalationForm.get("emailsubject").value,
      EmailBody: this.emailbodycontent,
      PeakCountOrDuration: this.EscalationForm.get("peak").value,
      OffPeakCountOrDuration: this.EscalationForm.get("offpeak").value,
      DelayDuration: this.EscalationForm.get("delay").value,
      Status: this.EscalationForm.get("status").value,
      ConstantBody: this.EscalationForm.get("constantBody").value,
      DelayStatus: this.EscalationForm.get("dstatus").value,
    }

    this.escalationService.AddEscalationFormat(model).subscribe(res => {
      if (!res.error) {
        this.markClean();
        this.message = res.message;
        this.toastr.success(this.message);
        setTimeout(function () {
          this.AllbooleanFalse();
          this.markClean();
        }.bind(this), 1000);
      }
      else {
        this.message = res.message;
        this.toastr.error(this.message);
      }
    });
  }

  UpdateEscalation() {

    let model =
    {
      EscalationID: this.EscalationForm.get("Id").value,
      escalationType: this.EscalationForm.get("type").value,
      EmailSubject: this.EscalationForm.get("emailsubject").value,
      EmailBody: this.emailbodycontent,
      PeakCountOrDuration: this.EscalationForm.get("peak").value,
      OffPeakCountOrDuration: this.EscalationForm.get("offpeak").value,
      DelayDuration: this.EscalationForm.get("delay").value,
      Status: this.EscalationForm.get("status").value,
      ConstantBody: this.EscalationForm.get("constantBody").value,
      DelayStatus: this.EscalationForm.get("dstatus").value,
    }

    this.escalationService.UpdateEscalationFormat(model).subscribe(res => {
      if (!res.error) {
        this.markClean();
        this.message = res.message;
        this.toastr.success(this.message);
      }
      else {
        this.message = res.message;
        this.toastr.error(this.message);
      }
    });

  }

  onCreate(e) {

    if (this.existingEmails.includes(e.data.email)) {
      this.message = "Email Already Exist!";
      this.toastr.error(this.message);
      this.retriveemail();
      return;
    }

    let model =
    {
      email: e.data.email,
      status: this.selectedescalations[0].escalationType === "Analyst" || this.selectedescalations[0].escalationType === "Case" ? false : e.data.status,
      escalationID: this.selectedescalations[0].escalationID,
      escalationType: this.selectedescalations[0].escalationType,
      islevelone: this.selectedescalations[0].escalationLevel === 1 ? e.data.status : false,
      isleveltwo: this.selectedescalations[0].escalationLevel === 2 ? e.data.status : false,
      isDeleted: false
    };

    this.escalationService.AddEscalationEmail(model).subscribe(res => {
      if (!res.error) {
        this.message = res.message;
        this.toastr.success(this.message);
        this.retriveemail();

      }
      else {
        this.message = res.message;
        this.toastr.error(this.message);
      }
    });

  }

  onRowUpdating(event) {

    const updatedData = { ...event.oldData, ...event.newData };
    const newEmail = updatedData.email;
    const currentEmail = event.oldData.email;

    if (newEmail != currentEmail && this.existingEmails.includes(newEmail)) {
      this.message = "Email Already Exist!";
      this.toastr.error(this.message);
      this.retriveemail();
      return;
    }

    let model =
    {
      EmailID: updatedData.emailID,
      email: updatedData.email,
      status: this.selectedescalations[0].escalationType === "Analyst" || this.selectedescalations[0].escalationType === "Case" ? updatedData.dstatus : updatedData.status,
      escalationID: this.selectedescalations[0].escalationID,
      escalationType: this.selectedescalations[0].escalationType,
      islevelone: this.selectedescalations[0].escalationLevel === 1 ? updatedData.status : updatedData.islevelone,
      isleveltwo: this.selectedescalations[0].escalationLevel === 2 ? updatedData.status : updatedData.isleveltwo,
    };

    this.escalationService.UpdateEscalationEmail(model).subscribe(res => {
      if (!res.error) {

        this.message = res.message;
        this.toastr.success(this.message);
        this.retriveemail();

      }
      else {
        this.message = res.message;
        this.toastr.error(this.message);
      }
    });
  }

  onDelete(e) {

    this.escalationService.DeleteEscalationEmail(e.key).subscribe(res => {
      if (!res.error) {
        this.message = res.message;
        this.toastr.success(this.message);
        this.retriveemail();

      }
      else {
        this.message = res.message;
        this.toastr.error(this.message);
      }
    });
  }

  AllNewValue() {

    this.EscalationForm.patchValue({
      Id: 0,
      type: this.selectedescalationtype,
      level: this.selectedescalationlevel,
      emailsubject: this.defaultSubject(),
      emailbody: this.defaultBody(),
      constantBody: '',
      peak: 0,
      offpeak: 0,
      status: false,
      delay: 0,
      dstatus: false
    });

    this.emailbodycontent = this.EscalationForm.get("emailbody").value;
    this.setVariables();
    this.cd.detectChanges();

  }

  get hasUnsavedChanges(): boolean {
    return this.showForm && (this.EscalationForm.dirty || this.bodyDirty);
  }

  markClean() {
    this.EscalationForm.markAsPristine();
    this.bodyDirty = false;
  }

  guard(action: () => void, revert?: () => void) {
    if (this.hasUnsavedChanges) {
      this.pendingAction = action;
      this.pendingRevert = revert || null;
      this.leaveVisible = true;
    } else {
      action();
    }
  }

  leaveStay() {
    this.leaveVisible = false;
    if (this.pendingRevert) {
      this.reverting = true;
      this.pendingRevert();
      this.reverting = false;
    }
    this.pendingAction = null;
    this.pendingRevert = null;
  }

  leaveDiscard() {
    this.leaveVisible = false;
    this.markClean();
    const action = this.pendingAction;
    this.pendingAction = null;
    this.pendingRevert = null;
    if (action) { action(); }
  }

  requestType(value: string) { if (value !== this.selectedescalation) { this.guard(() => this.onChangeEscalation({ value })); } }
  requestLevel(level: number) { if (level !== this.escalationselection) { this.guard(() => this.setLevel(level)); } }
  requestTrigger(v: number) { if (v !== this.selecteddatasourceesctype) { this.guard(() => this.setDatasourceTrigger(v)); } }
  requestView(view: 'config' | 'overview') { this.guard(() => this.setView(view)); }
  requestModel(e) { this.selectGuard(e, () => this.onChangeDatasourceModel(e)); }
  requestDatasource(e) { this.selectGuard(e, () => this.onChangeDatasource(e)); }

  selectGuard(e, action: () => void) {
    if (this.reverting) { return; }
    if (!e.event) { action(); return; }
    this.guard(action, () => e.component.option('value', e.previousValue));
  }

  cancel() {
    this.guard(() => this.AllbooleanFalse());
  }

  AllbooleanFalse() {
    this.selectedescalation = '';
    this.selectedescalationlevel = 0;
    this.escalationselection = null;
    this.emailbodycontent = '';
    this.selecteddatasource = null;
    this.selecteddatasourceesctype = '';
    this.showgrid = false
    this.isdatasource = false;
    this.isanalyst = false;
    this.iscase = false;
    this.isselecteddatasource = false;
    this.isanalystlevel = false;
    this.iscaselevel = false;
    this.isdatasourceesctype = false;
    this.isdelayduration = false;
    this.isnosuspect = false;
    this.selecteddatasourcemodel = null;
    this.modelPortfolios = [];
  }

  portfolioModelKey(p: any): string {
    return ((p && (p.Model || p.model || p.ModelName || p.PortfolioType || p.Type || p.type)) || '').toString().toLowerCase();
  }

  modelOf(p: any): string | null {
    const key = this.portfolioModelKey(p);
    const match = this.datasourceModels.find(m => m.value.toLowerCase() === key);
    return match ? match.value : null;
  }

  portfoliosForModel(model: string): any[] {
    const hasModelInfo = this.ALLPortfolio.some(p => this.portfolioModelKey(p));
    if (!hasModelInfo) { return this.ALLPortfolio; }
    return this.ALLPortfolio.filter(p => this.portfolioModelKey(p) === model.toLowerCase());
  }

  onChangeDatasourceModel(e) {
    this.selecteddatasourcemodel = e.value;
    this.modelPortfolios = this.portfoliosForModel(e.value);
    this.selecteddatasource = null;
    this.selecteddatasourceesctype = '';
    this.isdatasourceesctype = false;
    this.isselecteddatasource = false;
    this.isnosuspect = false;
    this.isdelayduration = false;
    this.showgrid = false;
    this.reportdata = null;
    this.emailbodycontent = '';
  }

}
