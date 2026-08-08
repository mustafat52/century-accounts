import { useApp } from '../context/AppContext';
import { formatINR } from '../utils/format';
import logoLight from '../assets/logo-light.png';

export default function PrintableDocument() {
  const { printTarget, closePrint, invoices, quotations, customers, convertQuotationToInvoice } = useApp();

  if (!printTarget) return null;

  const customer = (id: string) => customers.find((c) => c.id === id);

  const invoice = printTarget.kind === 'invoice' ? invoices.find((i) => i.id === printTarget.id) : undefined;
  const quotation = printTarget.kind === 'quotation' ? quotations.find((q) => q.id === printTarget.id) : undefined;

  const doc = invoice ?? quotation;
  if (!doc) return null;

  const cust = customer(doc.customerId);
  const isInvoice = printTarget.kind === 'invoice';
  const transportation = invoice?.transportation ?? 0;
  const total = doc.amount + doc.gst + transportation;
  const cgst = doc.gst / 2;
  const sgst = doc.gst / 2;

  const glassItems = invoice ? invoice.items.filter((it) => it.itemType === 'glass') : [];
  const hardwareItems = invoice ? invoice.items.filter((it) => it.itemType === 'simple') : [];
  // Quotations only ever have one flat line item; invoices with no items fall back to their summary too.
  const fallbackItem = !invoice
    ? [{ id: 'summary', description: doc.description, quantity: 1, rate: doc.amount, amount: doc.amount }]
    : [];

  return (
    <div className="receipt-overlay">
      <div className="receipt-toolbar no-print">
        {printTarget.kind === 'quotation' && quotation?.status === 'pending' && (
          <button
            className="btn btn-primary"
            onClick={() => {
              convertQuotationToInvoice(quotation.dbId);
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
            <img src={logoLight} alt="Century Glass Art" style={{ width: 190, height: 'auto', marginBottom: 8 }} />
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              11-1-268, X Road, opposite Hameed Cafe, Darus Salam, Aghapura, Nampally, Hyderabad, Telangana 500001
              <br />
              centuryglassart@gmail.com
              <br />
              GSTIN: 36AMJPH2003H1ZI
            </div>
          </div>
          <div className="receipt-meta">
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
              {isInvoice ? (doc.gst > 0 ? 'TAX INVOICE' : 'INVOICE') : 'QUOTATION'}
            </div>
            <div style={{ marginTop: 6 }}>{doc.id}</div>
            <div>Date: {doc.date}</div>
            {isInvoice && invoice && <div>Due: {invoice.dueDate ?? 'Set on completion'}</div>}
            {!isInvoice && quotation && <div>Valid until: {quotation.validUntil}</div>}
          </div>
        </div>

        <div className="receipt-section-label">Bill To</div>
        <div style={{ fontSize: 14, marginBottom: 22 }}>
          <div style={{ fontWeight: 700 }}>{cust?.name ?? 'Unknown customer'}</div>
          <div style={{ color: '#555' }}>{cust?.contact}</div>
          {cust?.address && <div style={{ color: '#555' }}>{cust.address}</div>}
          {cust?.gstin && <div style={{ color: '#555' }}>GSTIN: {cust.gstin}</div>}
        </div>

        {glassItems.length > 0 && (
          <>
            <div className="receipt-section-label">Glass Work</div>
            <table className="receipt-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Description</th>
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
                    <td>{item.description}</td>
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

        {(hardwareItems.length > 0 || fallbackItem.length > 0) && (
          <>
            <div className="receipt-section-label">{glassItems.length > 0 ? 'Architectural Hardware' : 'Items'}</div>
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(hardwareItems.length > 0 ? hardwareItems : fallbackItem).map((item) => (
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
            <span>{formatINR(doc.amount)}</span>
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
          {isInvoice && invoice && invoice.paidAmount > 0 && (
            <>
              <div className="receipt-totals-row" style={{ marginTop: 10, borderTop: '1px dashed #ccc', paddingTop: 10 }}>
                <span>Paid so far</span>
                <span>{formatINR(invoice.paidAmount)}</span>
              </div>
              <div className="receipt-totals-row grand">
                <span>Balance Due</span>
                <span>{formatINR(invoice.balance)}</span>
              </div>
            </>
          )}
        </div>

        <div className="receipt-section-label" style={{ marginTop: 28 }}>
          Bank Details
        </div>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>
          Century Glass Art · Kotak Mahindra Bank · A/c 7113145246 · IFSC KKBK0007452 · N.S Road Branch
        </div>

        <div className="receipt-section-label">Terms &amp; Conditions</div>
        <div style={{ fontSize: 11, color: '#777', lineHeight: 1.6, marginBottom: 10 }}>
          Delivery within 15 days of confirmation, PO, sizes, and drawings. Custom-made goods are
          non-cancellable once production begins. Responsibility ceases once goods leave our
          premises; no guarantee against scratches after installation. Subject to Hyderabad
          jurisdiction. E.&amp;O.E.
        </div>

        <div className="receipt-footer">
          <div>
            {isInvoice
              ? invoice && invoice.paidAmount > 0 && invoice.balance > 0
                ? 'Advance received with thanks. Balance due by the date above.'
                : 'Thank you for your business. Payment due by the date above.'
              : 'This quotation is an estimate and subject to confirmation at the time of order.'}
          </div>
          <div className="receipt-signature">
            <div className="receipt-signature-line">For Century Glass Art</div>
          </div>
        </div>
      </div>
    </div>
  );
}