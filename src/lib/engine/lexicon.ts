/* Skill & keyword lexicon for the on-device engine.
   Format: "Canonical|alias|alias". Aliases are matched on word boundaries.
   Aliases of 2 characters or fewer are matched case-sensitively (AP, AR, GL…). */

export type TermCategory = "tool" | "domain" | "soft" | "certification";

const TOOLS = `Excel|Microsoft Excel|MS Excel|Advanced Excel|Excel spreadsheets
SQL|T-SQL|PL/SQL|SQL queries
MySQL
PostgreSQL|Postgres
Python
Power BI|PowerBI|Microsoft Power BI
Tableau
Looker|Looker Studio|Google Data Studio
Qlik|QlikView|Qlik Sense
SAP|SAP ERP|SAP S/4HANA|SAP FICO
Oracle|Oracle ERP|Oracle Financials
NetSuite|Oracle NetSuite
QuickBooks
Xero
Sage
Workday
Microsoft Dynamics|Dynamics 365
Salesforce|SFDC
HubSpot
Zendesk
ServiceNow
Google Analytics|GA4
Google Ads|AdWords
Meta Ads|Facebook Ads|Instagram Ads
Mailchimp
Marketo
Hootsuite
Canva
Figma
Sketch
Adobe XD
Photoshop|Adobe Photoshop
Illustrator|Adobe Illustrator
InDesign|Adobe InDesign
Adobe Creative Suite|Adobe Creative Cloud
Premiere Pro|Adobe Premiere
After Effects
JavaScript|JS
TypeScript
React|React.js|ReactJS
Next.js|NextJS
Angular|AngularJS
Vue|Vue.js|VueJS
Node.js|NodeJS
Java
C#
C++
.NET|dotnet|ASP.NET
PHP
Ruby
Ruby on Rails|Rails
Golang
Rust
Swift
Kotlin
HTML|HTML5
CSS|CSS3|Tailwind CSS
Django
Flask
Spring Boot|Spring Framework
AWS|Amazon Web Services
Azure|Microsoft Azure
GCP|Google Cloud|Google Cloud Platform
Docker
Kubernetes|K8s
Terraform
Git|GitHub|GitLab|Bitbucket
CI/CD|continuous integration|continuous delivery
Linux|Unix
REST APIs|REST API|RESTful|RESTful APIs
GraphQL
MongoDB
Snowflake
BigQuery
Redshift
Databricks
Apache Spark|PySpark
Hadoop
Airflow|Apache Airflow
dbt
ETL|ELT|ETL pipelines
Pandas
NumPy
scikit-learn|sklearn
TensorFlow
PyTorch
Jupyter|Jupyter Notebooks
Jira
Confluence
Asana
Trello
Notion
Microsoft Office|MS Office|Office 365|Microsoft 365
Microsoft Word|MS Word
PowerPoint|Microsoft PowerPoint|MS PowerPoint
Outlook|Microsoft Outlook
Google Sheets
Google Workspace|G Suite
VBA|Excel VBA|macros
Alteryx
SPSS
SAS
Stata
MATLAB
Bloomberg Terminal|Bloomberg
Visio|Microsoft Visio
Shopify
WordPress
AutoCAD
SolidWorks
Revit
Pivot Tables|pivot table|pivot-table|pivottables
VLOOKUP|Lookups|XLOOKUP|INDEX MATCH|HLOOKUP`;

const DOMAIN = `Financial Analysis|financial analyses|analyzing financial|analysing financial|financial analyst
Financial Modeling|financial modelling|financial models|financial model|build models|building models
Forecasting|forecasts|forecast|reforecasting
Budgeting|budgets|budget|budget planning|annual budget
Variance Analysis|variance analyses|variances|budget vs actual|budget-to-actual
FP&A|financial planning and analysis|financial planning & analysis|financial planning
Financial Reporting|financial reports|financial statements|financial statement
Management Reporting|management reports|management accounts
Accounts Payable|AP|payables
Accounts Receivable|AR|receivables|collections
General Ledger|GL|ledger
Reconciliation|reconciliations|reconciled|reconcile|reconciling|account reconciliation|bank reconciliation
Month-End Close|month end close|month-end|period close|close process|year-end close
Journal Entries|journal entry
Accruals|accrual
Audit|auditing|audits|internal audit|external audit|audit support
GAAP|US GAAP
IFRS
Tax|taxation|tax compliance|tax returns
Payroll
Cash Flow|cash flow management|cash flow forecasting|cash management
Valuation|DCF|discounted cash flow
Cost Analysis|cost accounting|costing|cost reduction|cost savings|cost-saving
Treasury
Credit Analysis|credit risk
Risk Management|risk assessment|risk analysis
Compliance|regulatory compliance|regulatory reporting
Internal Controls|SOX|Sarbanes-Oxley
Invoice Processing|invoicing|invoices|invoice
Three-Way Matching|3-way match|three-way match|3-way matching
Vendor Management|vendor relations|supplier management|vendor
Procurement|purchasing|sourcing|purchase orders
Bookkeeping
Due Diligence
Mergers & Acquisitions|M&A|mergers and acquisitions
Investment Analysis|investment research
Portfolio Management
Equity Research
KPIs|KPI|key performance indicators|metrics tracking
Dashboards|dashboard|dashboarding
Data Analysis|data analytics|analyzing data|analysed data|analyzed data|analyse data|analyze data
Data Visualization|data visualisation|visualizations
Reporting
Business Intelligence
Data Modeling|data modelling
Data Cleaning|data cleansing|data quality
Statistics|statistical analysis|statistical
A/B Testing|AB testing|split testing|experimentation
Machine Learning
Deep Learning
NLP|natural language processing
Business Analysis|business analyst
Requirements Gathering|requirements analysis|business requirements|gathering requirements
Process Improvement|process optimization|continuous improvement|streamlined processes|process efficiency
Stakeholder Management|stakeholder engagement|stakeholders
Project Management|managed projects|project delivery
Program Management
Product Management|product manager
Product Roadmap|roadmap|roadmapping
User Research|UX research|usability testing
Market Research|market analysis
Competitive Analysis|competitor analysis
Digital Marketing
Content Marketing|content strategy|content creation
Social Media Marketing|social media|social media management
Email Marketing|email campaigns
Brand Management|branding|brand strategy
Campaign Management|campaigns|marketing campaigns
Lead Generation|lead gen
Marketing Automation
Copywriting
SEO|search engine optimization|search engine optimisation
SEM|search engine marketing
PPC|pay-per-click|paid search
CRM|customer relationship management
Sales|selling|sales targets|quota
B2B
B2C
Account Management|key accounts|client accounts
Business Development
Customer Service|customer support|client service
Customer Success
Cold Calling|outbound calls
Pipeline Management|sales pipeline
Operations Management|operations manager|operational management
Supply Chain|supply chain management
Logistics
Inventory Management|inventory
Quality Assurance|QA
Quality Control
Scheduling
Recruitment|recruiting|talent acquisition|sourcing candidates
Onboarding
Employee Relations
HRIS
Training & Development|training and development|staff training
UX Design|user experience|user experience design
UI Design|user interface|user interface design|visual design
Wireframing|wireframes
Prototyping|prototypes|prototype
Software Development|software engineering|software engineer
Web Development|web developer
Unit Testing|test automation|automated testing|testing
Microservices
System Design
Cloud Computing
Cybersecurity|information security|security
Technical Writing|documentation
Event Planning|events management|event management
Grant Writing
Curriculum Development
Patient Care
Agile|agile methodology
Scrum
Kanban
Lean Six Sigma|Six Sigma
Lean`;

const SOFT = `Communication|communication skills|communicate|communicating|communicated|written and verbal
Collaboration|teamwork|team player|collaborative|collaborate|collaborated|worked closely
Problem Solving|problem-solving|solve problems|solving problems|resolved issues|resolve issues
Analytical Thinking|analytical skills|analytical|analytically
Attention to Detail|detail-oriented|detail oriented|attention-to-detail|meticulous|accuracy
!Leadership|leadership skills|leadership experience|strong leadership|demonstrated leadership|leading teams|led a team|team lead|led teams|people management
Time Management|prioritization|prioritize|prioritizing|multitasking|multi-tasking|deadlines|deadline-driven
Critical Thinking
Adaptability|flexible|adaptable|flexibility
Organization|organizational skills|organized|organisational skills
Presentation Skills|presentations|presenting|presented
Interpersonal Skills|relationship building|interpersonal
Initiative|self-starter|proactive|self-motivated
Creativity|creative thinking
Customer Focus|customer-focused|customer-centric|client-focused
Negotiation|negotiating|negotiated
Mentoring|coaching|mentored|coached
Decision Making|decision-making
Cross-Functional Collaboration|cross-functional teams|cross-functional|cross functional`;

const CERTS = `CPA|Certified Public Accountant
CFA|Chartered Financial Analyst
ACCA
CIMA
CMA|Certified Management Accountant
PMP|Project Management Professional
CAPM
Certified ScrumMaster|CSM|Scrum Master
Six Sigma Green Belt|Green Belt
AWS Certified|AWS Certification|AWS Solutions Architect
FRM
SHRM-CP|SHRM
PHR`;

export interface LexTerm {
  canonical: string;
  aliases: string[];
  category: TermCategory;
}

function parse(block: string, category: TermCategory): LexTerm[] {
  return block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [first, ...aliases] = line.split("|").map((s) => s.trim());
      // "!Name" = display name only; don't match the bare word (too ambiguous, e.g. "leadership" = management team)
      const bareOnly = first.startsWith("!");
      const canonical = bareOnly ? first.slice(1) : first;
      return { canonical, aliases: bareOnly ? aliases : [canonical, ...aliases], category };
    });
}

export const LEXICON: LexTerm[] = [
  ...parse(TOOLS, "tool"),
  ...parse(DOMAIN, "domain"),
  ...parse(SOFT, "soft"),
  ...parse(CERTS, "certification"),
];

/** Groups of closely related skills. If a CV shows one member, a missing member is
    an INFERENCE worth asking about — never a fact to add. */
export const CLUSTERS: string[][] = [
  ["Financial Analysis", "Financial Modeling", "Forecasting", "Budgeting", "Variance Analysis", "FP&A", "Valuation", "Cash Flow", "Financial Reporting", "Management Reporting", "Cost Analysis", "Investment Analysis"],
  ["Accounts Payable", "Accounts Receivable", "General Ledger", "Reconciliation", "Month-End Close", "Journal Entries", "Accruals", "Bookkeeping", "Invoice Processing", "Three-Way Matching", "Audit", "Internal Controls", "Financial Reporting"],
  ["Excel", "Google Sheets", "Pivot Tables", "VLOOKUP", "VBA", "Financial Modeling"],
  ["Power BI", "Tableau", "Looker", "Qlik", "Data Visualization", "Dashboards", "Business Intelligence"],
  ["SQL", "MySQL", "PostgreSQL", "Data Analysis", "Data Modeling", "Data Cleaning", "Reporting", "BigQuery", "Snowflake"],
  ["Python", "Pandas", "NumPy", "scikit-learn", "Jupyter", "Machine Learning", "Deep Learning", "NLP", "TensorFlow", "PyTorch"],
  ["SAP", "Oracle", "NetSuite", "QuickBooks", "Xero", "Sage", "Microsoft Dynamics", "Workday"],
  ["Salesforce", "HubSpot", "CRM", "Zendesk"],
  ["Digital Marketing", "SEO", "SEM", "PPC", "Google Ads", "Meta Ads", "Content Marketing", "Social Media Marketing", "Email Marketing", "Marketing Automation", "Google Analytics", "Campaign Management", "Lead Generation", "Copywriting", "Brand Management"],
  ["Sales", "Account Management", "Business Development", "Lead Generation", "Pipeline Management", "Cold Calling", "Negotiation", "Customer Success", "B2B"],
  ["Project Management", "Program Management", "Agile", "Scrum", "Kanban", "Jira", "Stakeholder Management", "Asana"],
  ["JavaScript", "TypeScript", "React", "Next.js", "Angular", "Vue", "HTML", "CSS"],
  ["Node.js", "Java", "C#", ".NET", "Golang", "Ruby", "PHP", "REST APIs", "GraphQL", "Microservices"],
  ["AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "Cloud Computing"],
  ["Figma", "Sketch", "Adobe XD", "UX Design", "UI Design", "Wireframing", "Prototyping", "User Research"],
  ["Operations Management", "Supply Chain", "Logistics", "Inventory Management", "Procurement", "Vendor Management", "Process Improvement", "Lean", "Lean Six Sigma", "Scheduling", "Quality Assurance"],
  ["Recruitment", "Onboarding", "Employee Relations", "HRIS", "Training & Development", "Payroll", "Workday"],
  ["ETL", "Airflow", "dbt", "Snowflake", "BigQuery", "Redshift", "Databricks", "Apache Spark", "Data Modeling"],
  ["Business Analysis", "Requirements Gathering", "Process Improvement", "Stakeholder Management", "Data Analysis", "Visio"],
];

export const INDUSTRIES: Record<string, string[]> = {
  "Financial Services": ["bank", "banking", "investment", "asset management", "insurance", "fintech", "capital markets", "wealth", "brokerage", "lending"],
  "Professional Services": ["consulting", "advisory", "big four", "audit firm", "kpmg", "deloitte", "pwc", "ey ", "ernst", "accenture", "mckinsey"],
  Technology: ["software", "saas", "platform", "cloud", "tech company", "startup", "developer", "engineering team", "app"],
  Healthcare: ["hospital", "healthcare", "patient", "clinical", "medical", "pharma", "biotech", "health"],
  "Retail & E-commerce": ["retail", "e-commerce", "ecommerce", "store", "merchandising", "consumer goods", "fmcg", "cpg"],
  "Manufacturing & Industrial": ["manufacturing", "plant", "factory", "industrial", "production line"],
  "Logistics & Transportation": ["logistics", "freight", "shipping", "transportation", "warehouse", "supply chain"],
  "Education": ["school", "university", "education", "students", "teaching", "academic"],
  "Government & Public Sector": ["government", "public sector", "ministry", "federal", "municipal", "agency"],
  "Media & Marketing": ["agency", "media", "advertising", "creative agency", "publishing", "brand"],
  "Energy & Utilities": ["energy", "oil and gas", "utilities", "renewable", "power plant", "power generation"],
  "Real Estate": ["real estate", "property", "construction", "facilities"],
  "Hospitality & Travel": ["hotel", "hospitality", "travel", "restaurant", "tourism"],
  "Non-profit": ["non-profit", "nonprofit", "charity", "ngo", "foundation"],
};

export const FUNCTIONS: Record<string, string[]> = {
  Finance: ["financial analysis", "fp&a", "forecasting", "budgeting", "financial model", "variance", "finance"],
  Accounting: ["accounting", "accounts payable", "accounts receivable", "general ledger", "reconciliation", "bookkeeping", "gaap", "ifrs", "month-end", "audit", "accountant"],
  "Data Analysis": ["data analysis", "data analyst", "sql", "dashboards", "python", "tableau", "power bi", "statistics", "analytics"],
  "Business Analysis": ["business analyst", "business analysis", "requirements", "process mapping", "stakeholders", "user stories"],
  Marketing: ["marketing", "campaign", "seo", "content", "brand", "social media", "digital marketing", "growth"],
  Sales: ["sales", "quota", "pipeline", "business development", "account executive", "prospecting", "revenue targets"],
  Operations: ["operations", "logistics", "supply chain", "inventory", "process improvement", "procurement"],
  Product: ["product manager", "product management", "roadmap", "user research", "product owner", "backlog"],
  Engineering: ["software", "engineer", "developer", "code", "api", "javascript", "java", "backend", "frontend"],
  Design: ["designer", "figma", "ux", "ui", "wireframe", "prototype", "visual design"],
  "Human Resources": ["recruit", "talent", "hr ", "human resources", "onboarding", "employee relations", "payroll"],
  "Customer Service": ["customer service", "customer support", "client service", "help desk", "customer success"],
  "Project Management": ["project manager", "project management", "pmp", "scrum", "agile", "delivery"],
};

/** Words that are never useful as standalone keywords. */
export const GENERIC_WORDS = new Set(
  `ability able about above across activities additional all also an and any apply are as at based be being benefits best both business by can candidate candidates company competitive computer daily day demonstrated department description desired do duties e.g effective effectively employees environment equal etc excellent experience experienced familiarity field for from fast-paced full general good great have help high highly ideal ideally including independently individual information into is it its job join knowledge least level looking make management may more must new of on one opportunity or other our paced part people plus position preferred proficiency proficient related relevant required requirements responsibilities responsible role salary skills strong support team teams the their them this through time to understanding up us using various we well will with within work working world years you your`.split(/\s+/),
);

export const STOPWORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves per via etc`.split(/\s+/),
);
