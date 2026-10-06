// Business identity used on every printed document. Edit here once and
// the quotation, tax invoice, payment ledger and vendor slip all update.
export const BUSINESS = {
  name: 'Century Glass Art',
  address: '11-1-268, X Road, opposite Hameed Cafe, Darus Salam, Aghapura, Nampally, Hyderabad, Telangana 500001',
  email: 'centuryglassart@gmail.com',
  gstin: '36AMJPH2003H1ZI',
  state: 'Telangana',
  bank: {
    companyName: 'Century Glass Art',
    bankName: 'KOTAK MAHINDRA BANK',
    branch: 'N.S Road',
    accountNo: '7113145246',
    ifsc: 'KKBK0007452',
  },
} as const;