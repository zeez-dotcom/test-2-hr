export type TemplateKey = 'noc'|'salary'|'clearance'|'offer'|'experience'|'warning';

export const defaultTemplates: Record<TemplateKey, { title: string; en: string; ar: string; sigs?: Record<string, boolean> }> = {
  noc: {
    title: "No Objection Certificate",
    en: `To whom it may concern,\n\nThis is to certify that Mr./Ms. {{name}} (Employee ID: {{employeeId}}), working as {{position}} at {{companyName}}, has no objection from the company to {{purpose}}.\n\nThis certificate is issued upon the employee's request without any responsibility on {{companyName}}.\n\nDate: {{date}}`,
    ar: `إلى من يهمه الأمر،\n\nنفيد بأن السيد/السيدة {{name}} (رقم الموظف: {{employeeId}})، يعمل لدينا بوظيفة {{position}} لدى شركة {{companyName}}، ولا مانع لدينا من {{purpose}}.\n\nوقد أعطيت هذه الشهادة بناءً على طلبه/طلبها دون أدنى مسؤولية على شركة {{companyName}}.\n\nالتاريخ: {{date}}`,
    sigs: { hr: true, ceo: true, employee: true }
  },
  salary: {
    title: "Salary Certificate",
    en: `To whom it may concern,\n\nThis is to certify that Mr./Ms. {{name}} (Employee ID: {{employeeId}}) is employed with {{companyName}} as {{position}}.\n\nTotal monthly salary: {{salary}}\n\nThis certificate is issued upon request.\n\nDate: {{date}}`,
    ar: `إلى من يهمه الأمر،\n\nنفيد بأن السيد/السيدة {{name}} (رقم الموظف: {{employeeId}}) يعمل لدى شركة {{companyName}} بوظيفة {{position}}.\n\nإجمالي الراتب الشهري: {{salary}}\n\nوقد صدرت هذه الشهادة بناءً على طلبه/طلبها.\n\nالتاريخ: {{date}}`,
    sigs: { hr: true, accountant: true, employee: true }
  },
  clearance: {
    title: "Clearance Letter",
    en: `To whom it may concern,\n\nThis is to certify that Mr./Ms. {{name}} (Employee ID: {{employeeId}}) has no outstanding obligations towards {{companyName}} as of {{date}}.\n\nWe wish him/her all the best.`,
    ar: `إلى من يهمه الأمر،\n\nنفيد بأن السيد/السيدة {{name}} (رقم الموظف: {{employeeId}}) لا توجد عليه/عليها أي التزامات تجاه شركة {{companyName}} اعتبارًا من {{date}}.\n\nمع تمنياتنا له/لها بالتوفيق.`,
    sigs: { hr: true, accountant: true, ceo: true }
  },
  offer: {
    title: "Employment Offer",
    en: `Dear {{name}},\n\nWe are pleased to offer you the position of {{position}} at {{companyName}} with a monthly salary of {{salary}} effective {{date}}.\n\nPlease confirm your acceptance.`,
    ar: `السيد/السيدة {{name}}،\n\nيسعدنا أن نقدم لكم وظيفة {{position}} في شركة {{companyName}} براتب شهري قدره {{salary}} اعتبارًا من {{date}}.\n\nيرجى تأكيد قبولكم.`,
    sigs: { hr: true, ceo: true }
  },
  experience: {
    title: "Experience Letter",
    en: `To whom it may concern,\n\nThis is to certify that Mr./Ms. {{name}} worked with {{companyName}} as {{position}} from {{startDate}} to {{endDate}}.\n\nHe/She demonstrated professionalism and dedication.`,
    ar: `إلى من يهمه الأمر،\n\nنفيد بأن السيد/السيدة {{name}} عمل لدى شركة {{companyName}} بوظيفة {{position}} من {{startDate}} إلى {{endDate}}.\n\nوقد أظهر/أظهرت الاحترافية والالتزام.`,
    sigs: { hr: true }
  },
  warning: {
    title: "Warning Notice",
    en: `Mr./Ms. {{name}},\n\nThis is a formal warning regarding: {{purpose}}.\n\nPlease rectify immediately to avoid further action. Date: {{date}}`,
    ar: `السيد/السيدة {{name}}،\n\nهذا إنذار رسمي بخصوص: {{purpose}}.\n\nيرجى التصحيح فورًا لتجنب اتخاذ إجراءات أخرى. التاريخ: {{date}}`,
    sigs: { hr: true }
  }
};

