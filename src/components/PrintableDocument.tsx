import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import type { QuotationItem } from '../types';
import { PAYMENT_METHOD_LABELS } from '../types';
import logoLight from '../assets/logo-light.png';

const BUSINESS_HEADER = (
  <div style={{ fontSize: 10, color: '#666', marginTop: 4, lineHeight: 1.4 }}>
    11-1-268, X Road, opposite Hameed Cafe, Darus Salam, Aghapura, Nampally, Hyderabad, Telangana 500001
    <br />
    centuryglassart@gmail.com
    <br />
    GSTIN: 36AMJPH2003H1ZI
  </div>
);

export default function PrintableDocument() {
  const {
    printTarget,
    closePrint,
    invoices,
    quotations,
    quotationPayments,
    customers,
    vendors,
    vendorSlips,
    convertQuotationToInvoice,
    fetchQuotationItemsForPrint,
  } = useApp();

  // Quotations don't carry their items in app state (unlike invoices,
  // which are preloaded) — so printing one means fetching its real,
  // fully-computed line items on demand here.
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);

  useEffect(() => {
    if (printTarget?.kind === 'quotation' || printTarget?.kind === 'ledger') {
      const q = quotations.find((qq) => qq.id === printTarget.id);
      if (q) {
        fetchQuotationItemsForPrint(q.dbId).then(setQuotationItems);
        return;
      }
    }
    setQuotationItems([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printTarget?.kind, printTarget?.id]);

  if (!printTarget) return null;

  if (printTarget.kind === 'slip') {
    const slip = vendorSlips.find((s) => s.id === printTarget.id);
    if (!slip) return null;
    const vendor = vendors.find((v) => v.id === slip.vendorId);

    return (
      <div className="receipt-overlay">
        <div className="receipt-toolbar no-print">
          <button className="btn btn-ghost" onClick={() => window.print()}>
            Print
          </button>
          <button className="btn btn-ghost" onClick={closePrint}>
            Close
          </button>
        </div>

        <div className="receipt-page">
          <div className="receipt-head">
            <div>
              <img src={logoLight} alt="Century Glass Art" style={{ width: 130, height: 'auto', marginBottom: 4 }} />
              {BUSINESS_HEADER}
            </div>
            <div className="receipt-meta">
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>PURCHASE SLIP</div>
              <div style={{ marginTop: 6 }}>{slip.dcNo}</div>
              <div>Date: {slip.slipDate}</div>
              <div>Care of: {slip.careOf}</div>
            </div>
          </div>

          <div className="receipt-section-label">Vendor</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            <div style={{ fontWeight: 700 }}>{vendor?.name ?? 'Unknown vendor'}</div>
            <div style={{ color: '#555' }}>{vendor?.contact}</div>
          </div>

          <div className="receipt-section-label">Items Requested</div>
          <table className="receipt-table" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Quantity</th>
                <th style={{ textAlign: 'right' }}>Unit</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {slip.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                  <td style={{ textAlign: 'right' }}>{item.unit}</td>
                  <td style={{ textAlign: 'right' }}></td>
                  <td style={{ textAlign: 'right' }}></td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-footer">
            <div>Please enter your rates against each item above and return this slip.</div>
            <div className="receipt-signature">
              <div className="receipt-signature-line">For Century Glass Art</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const customer = (id: string) => customers.find((c) => c.id === id);

  // ---- Ledger: the running-balance/payment-history document ----
  // Deliberately a SEPARATE document from the formal Quotation below, even
  // though it shares the same visual shell (header/branding/business
  // details) — a formal quotation is a fixed offer; the Ledger is a live
  // snapshot of what's been paid and what's still owed, and only exists
  // pre-settlement. Once a quotation converts, the terminal Invoice
  // printable (below) is what's used instead — balance is always ₹0 by
  // then, so there's nothing left for a running ledger to show.
  if (printTarget.kind === 'ledger') {
    const quotation = quotations.find((q) => q.id === printTarget.id);
    if (!quotation) return null;
    const cust = customer(quotation.customerId);
    const payments = quotationPayments
      .filter((p) => p.quotationId === quotation.dbId)
      .sort((a, b) => (a.paymentDate < b.paymentDate ? -1 : 1));
    const cgst = quotation.gst / 2;
    const sgst = quotation.gst / 2;

    return (
      <div className="receipt-overlay">
        <div className="receipt-toolbar no-print">
          {quotation.status === 'pending' && (
            <button
              className="btn btn-primary"
              onClick={async () => {
                await convertQuotationToInvoice(quotation.dbId);
                closePrint();
              }}
            >
              Convert to Invoice
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => window.print()}>
            Print
          </button>
          <button className="btn btn-ghost" onClick={closePrint}>
            Close
          </button>
        </div>

        <div className="receipt-page">
          <div className="receipt-head">
            <div>
              <img src={logoLight} alt="Century Glass Art" style={{ width: 120, height: 'auto', marginBottom: 4 }} />
              {BUSINESS_HEADER}
            </div>
            <div className="receipt-meta">
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>PAYMENT LEDGER</div>
              <div style={{ marginTop: 6 }}>{quotation.id}</div>
              <div>As of: {new Date().toISOString().slice(0, 10)}</div>
            </div>
          </div>

          <div className="receipt-section-label">Bill To</div>
          <div style={{ fontSize: 12, marginBottom: 14 }}>
            <div style={{ fontWeight: 700 }}>{cust?.name ?? 'Unknown customer'}</div>
            <div style={{ color: '#555' }}>{cust?.contact}</div>
          </div>

          <div className="receipt-section-label">Payments Received</div>
          <table className="receipt-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Mode</th>
                <th>Note</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.paymentDate}</td>
                  <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                  <td>{p.note || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{formatINR(p.amount)}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ color: '#888' }}>
                    No payments recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="receipt-totals">
            <div className="receipt-totals-row">
              <span>Subtotal</span>
              <span>{formatINR(quotation.amount - quotation.discountAmount)}</span>
            </div>
            {quotation.gst > 0 && (
              <>
                <div className="receipt-totals-row">
                  <span>CGST (9%)</span>
                  <span>{formatINR(cgst)}</span>
                </div>
                <div className="receipt-totals-row">
                  <span>SGST (9%)</span>
                  <span>{formatINR(sgst)}</span>
                </div>
              </>
            )}
            {quotation.transportation > 0 && (
              <div className="receipt-totals-row">
                <span>Transportation</span>
                <span>{formatINR(quotation.transportation)}</span>
              </div>
            )}
            <div className="receipt-totals-row grand">
              <span>Total</span>
              <span>{formatINR(quotation.grandTotal)}</span>
            </div>
            <div className="receipt-totals-row" style={{ marginTop: 8, borderTop: '1px dashed #ccc', paddingTop: 8 }}>
              <span>Paid so far</span>
              <span>{formatINR(quotation.paidAmount)}</span>
            </div>
            <div className="receipt-totals-row grand">
              <span>Balance Due</span>
              <span>{formatINR(quotation.balanceAmount)}</span>
            </div>
          </div>

          <div className="receipt-footer">
            <div>
              {quotation.balanceAmount <= 0
                ? 'Fully settled — ready to convert to an invoice.'
                : 'Advance received with thanks. Kindly clear the remaining balance at your earliest convenience.'}
            </div>
            <div className="receipt-signature">
              <div className="receipt-signature-line">For Century Glass Art</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const invoice = printTarget.kind === 'invoice' ? invoices.find((i) => i.id === printTarget.id) : undefined;
  const quotation = printTarget.kind === 'quotation' ? quotations.find((q) => q.id === printTarget.id) : undefined;

  const doc = invoice ?? quotation;
  if (!doc) return null;

  const cust = customer(doc.customerId);
  const isInvoice = printTarget.kind === 'invoice';
  const transportation = invoice?.transportation ?? quotation?.transportation ?? 0;
  const discountAmount = invoice?.discountAmount ?? quotation?.discountAmount ?? 0;
  const slab = invoice?.slab ?? quotation?.slab ?? 'A';
  const total = doc.amount - discountAmount + doc.gst + transportation;
  const cgst = doc.gst / 2;
  const sgst = doc.gst / 2;

  const glassItems = invoice
    ? invoice.items.filter((it) => it.itemType === 'glass')
    : quotation
    ? quotationItems.filter((it) => it.itemType === 'glass')
    : [];
  const hardwareItems = invoice
    ? invoice.items.filter((it) => it.itemType === 'simple')
    : quotation
    ? quotationItems.filter((it) => it.itemType === 'simple')
    : [];

  return (
    <div className="receipt-overlay">
      <div className="receipt-toolbar no-print">
        <button className="btn btn-ghost" onClick={() => window.print()}>
          Print
        </button>
        <button className="btn btn-ghost" onClick={closePrint}>
          Close
        </button>
      </div>

      <div className="receipt-page">
        <div className="receipt-head">
          <div>
            <img src={logoLight} alt="Century Glass Art" style={{ width: 120, height: 'auto', marginBottom: 4 }} />
            {BUSINESS_HEADER}
          </div>
          <div className="receipt-meta">
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
              {isInvoice ? (doc.gst > 0 ? 'TAX INVOICE' : 'INVOICE') : 'QUOTATION'}
            </div>
            <div style={{ marginTop: 6 }}>{doc.id}</div>
            <div>Date: {doc.date}</div>
            {!isInvoice && quotation && <div>Valid until: {quotation.validUntil}</div>}
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{slab}</div>
          </div>
        </div>

        <div className="receipt-section-label">Bill To</div>
        <div style={{ fontSize: 12, marginBottom: 14 }}>
          <div style={{ fontWeight: 700 }}>{cust?.name ?? 'Unknown customer'}</div>
          <div style={{ color: '#555' }}>{cust?.contact}</div>
          {cust?.address && <div style={{ color: '#555' }}>{cust.address}</div>}
          {cust?.gstin && <div style={{ color: '#555' }}>GSTIN: {cust.gstin}</div>}
        </div>

        {glassItems.length > 0 && (
          <>
            <div className="receipt-section-label">Glass Work</div>
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Description of Goods</th>
                  <th style={{ textAlign: 'center' }}>Thickness</th>
                  <th style={{ textAlign: 'center' }}>Size (in)</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Sft</th>
                  <th style={{ textAlign: 'right' }}>Rate/Sft</th>
                  <th style={{ textAlign: 'right' }}>Rft</th>
                  <th style={{ textAlign: 'right' }}>Polish</th>
                  <th style={{ textAlign: 'right' }}>Fixing</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {glassItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.area || '—'}</td>
                    <td>{item.description}</td>
                    <td style={{ textAlign: 'center' }}>{item.thicknessMm || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{item.lengthIn} x {item.widthIn}</td>
                    <td style={{ textAlign: 'center' }}>{item.glassQty}</td>
                    <td style={{ textAlign: 'right' }}>{item.sft?.toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(item.ratePerSft ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{item.rft?.toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(item.polishAmount ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(item.fixingAmount ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {hardwareItems.length > 0 && (
          <>
            <div className="receipt-section-label">{glassItems.length > 0 ? 'Architectural Hardware' : 'Items'}</div>
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Description of Goods</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {hardwareItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.description}</td>
                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(item.rate ?? 0)}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="receipt-totals">
          <div className="receipt-totals-row">
            <span>Subtotal</span>
            <span>{formatINR(doc.amount - discountAmount)}</span>
          </div>
          {doc.gst > 0 && (
            <>
              <div className="receipt-totals-row">
                <span>CGST (9%)</span>
                <span>{formatINR(cgst)}</span>
              </div>
              <div className="receipt-totals-row">
                <span>SGST (9%)</span>
                <span>{formatINR(sgst)}</span>
              </div>
            </>
          )}
          {transportation > 0 && (
            <div className="receipt-totals-row">
              <span>Transportation</span>
              <span>{formatINR(transportation)}</span>
            </div>
          )}
          <div className="receipt-totals-row grand">
            <span>Total</span>
            <span>{formatINR(total)}</span>
          </div>
        </div>

        <div className="receipt-bottom">
          <div className="receipt-two-col">
            <div>
              <div className="receipt-section-label">Terms &amp; Conditions</div>
              <div style={{ fontSize: 9, color: '#555', lineHeight: 1.4 }}>
                <div>1. Delivery: 15 days from date of receipt of confirmation, PO and Final sizes along with fabrication drawings.</div>
                <div>2. Payment Terms: 70% Advance 20% on Delivery 10% on Completion</div>
                <div>3. These glasses are custom made for you and the order cannot be altered / cancelled after confirmation.</div>
                <div>4. Receive the above-mentioned articles as per your order in good condition</div>
                <div>5. Our Responsibility ceases no sooner the Goods leave our premises</div>
                <div>6. Quotation Validity - 2 days.</div>
                <div>7. We do not give guarantee on scratches</div>
                <div>8. All disputes shall be subject to Hyderabad Jurisdiction only.</div>
                <div>9. E &amp; O.E</div>
              </div>
            </div>
            <div>
              <div className="receipt-section-label">Bank Details</div>
              <div style={{ fontSize: 10, color: '#555', lineHeight: 1.5 }}>
                <div>Company Name - Century Glass Art</div>
                <div>Bank Name - KOTAK MAHINDRA BANK</div>
                <div>Branch - N.S Road</div>
                <div>Account No – 7113145246</div>
                <div>IFSC Code - KKBK0007452</div>
              </div>
            </div>
          </div>

          <div className="receipt-footer">
            <div>
              {isInvoice
                ? 'Thank you for your business. Paid in full.'
                : 'This quotation is an estimate and subject to confirmation at the time of order.'}
            </div>
            <div className="receipt-signature">
              <div className="receipt-signature-line">For Century Glass Art</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}