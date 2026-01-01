let total = 0;
let cart = [];
let nextCartId = 1;

// salesRecords persisted to localStorage
let salesRecords = [];
loadSales();

function loadSales() {
    try {
        const raw = localStorage.getItem('salesRecords');
        salesRecords = raw ? JSON.parse(raw) : [];
    } catch (e) {
        salesRecords = [];
    }
}

function saveSales() {
    try { localStorage.setItem('salesRecords', JSON.stringify(salesRecords)); } catch (e) {}
}

function renderSales() {
    const salesTotalEl = document.getElementById('salesTotal');
    const salesList = document.getElementById('salesList');
    const productSummary = document.getElementById('productSummary');
    if (!salesTotalEl || !salesList || !productSummary) return;

    const totalAmount = salesRecords.reduce((s, r) => s + Number(r.totalWithGst || 0), 0);
    salesTotalEl.innerText = Number(totalAmount).toFixed(2);

    // product counts
    const counts = {};
    salesRecords.forEach(r => {
        (r.items || []).forEach(it => { counts[it.item] = (counts[it.item] || 0) + (it.qty || 1); });
    });

    productSummary.innerHTML = '<strong>Products sold:</strong> ' + (Object.keys(counts).length ? Object.entries(counts).map(([k,v]) => `${k}: ${v}`).join(' | ') : 'None');

    // monthly summary grouped by YYYY-MM
    const monthly = {};
    salesRecords.forEach(r => {
        const d = r.isoDate ? new Date(r.isoDate) : new Date(r.date || r.displayDate || Date.now());
        if (isNaN(d)) return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        monthly[key] = (monthly[key] || 0) + Number(r.totalWithGst || 0);
    });
    const monthlyList = document.getElementById('monthlyList');
    if (monthlyList) {
        monthlyList.innerHTML = Object.keys(monthly).sort().reverse().map(k => {
            const [y,m] = k.split('-');
            const date = new Date(Number(y), Number(m)-1, 1);
            const label = date.toLocaleString(undefined, { month: 'long', year: 'numeric' });
            return `<li>${escapeHtml(label)} — ₹${Number(monthly[k]).toFixed(2)}</li>`;
        }).join('') || '<li>None</li>';
    }

    // detailed sales list (latest first)
    salesList.innerHTML = salesRecords.slice().reverse().map(r => {
        const d = r.displayDate || r.date || '';
        const cust = (r.customer && r.customer.name) ? escapeHtml(r.customer.name) : 'Unknown';
        const itemsHtml = (r.items || []).map(it => `<li>${escapeHtml(it.item)} x${it.qty||1} — ₹${Number(it.price).toFixed(2)}</li>`).join('');
        return `
            <li class="sale-record">
                <div><strong>${escapeHtml(d)}</strong> — ${cust} — ₹${Number(r.totalWithGst).toFixed(2)}</div>
                <div class="sale-details"><strong>Items:</strong><ul>${itemsHtml}</ul>
                <div>Payment: ${escapeHtml(r.paymentMethod || '')}</div>
                </div>
            </li>`;
    }).join('');
}

function recordSale(record) {
    salesRecords.push(record);
    saveSales();
    renderSales();
}

document.addEventListener('DOMContentLoaded', () => {
    const clearBtn = document.getElementById('clearSales');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (!confirm('Clear all sales records?')) return;
            salesRecords = [];
            saveSales();
            renderSales();
        });
    }
    renderSales();
});

function addToCart(item, price) {
    const tbody = document.getElementById("cartItems");
    const id = nextCartId++;

    // remove placeholder row if present
    if (tbody.children.length === 1) {
        const first = tbody.children[0];
        if (first && first.children.length === 1 && first.children[0].getAttribute('colspan')) {
            tbody.innerHTML = '';
        }
    }

    const tr = document.createElement('tr');
    tr.dataset.id = id;
    const qty = 1;
    const unit = Number(price);
    const line = qty * unit;
    tr.innerHTML = `
        <td>${escapeHtml(item)}</td>
        <td>${qty}</td>
        <td>₹${unit.toFixed(2)}</td>
        <td>₹${line.toFixed(2)}</td>
        <td><button class="removeBtn">Remove</button></td>
    `;
    tbody.appendChild(tr);

    cart.push({ id, item: String(item), price: Number(price), qty });

    // remove handler
    tr.querySelector('.removeBtn').addEventListener('click', () => removeFromCart(id));

    total += Number(price);
    updateTotalDisplay();
}

function removeFromCart(id) {
    const idx = cart.findIndex(c => c.id === id);
    if (idx === -1) return;
    total -= Number(cart[idx].price);
    cart.splice(idx, 1);
    const el = document.querySelector(`#cartItems tr[data-id='${id}']`);
    if (el) el.remove();
    updateTotalDisplay();
    // if cart empty, show placeholder row
    const tbody = document.getElementById('cartItems');
    if (tbody && tbody.children.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="5">No items in cart</td>';
        tbody.appendChild(row);
    }
}

function updateTotalDisplay() {
    document.getElementById("total").innerText = (Number(total) || 0).toFixed ? Number(total).toFixed(2) : total;
}

function placeOrder() {
    if (total === 0) {
        alert("Your cart is empty!");
        return;
    }

    // show payment selection modal, then receipt
    showPaymentModal((details) => {
        showReceipt(details);
    });
}

function showPaymentModal(callback) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal">
            <h2>Select Payment Method</h2>
            <label><input type="radio" name="pay" value="Credit Card" checked> Credit Card</label><br>
            <label><input type="radio" name="pay" value="UPI"> UPI</label><br>
            <label><input type="radio" name="pay" value="Cash On Delivery"> Cash On Delivery</label><br>

            <hr>
            <h3>Customer Details</h3>
            <label>Name:<br><input id="custName" type="text" placeholder="Full name" style="width:100%"></label><br>
            <label>Phone:<br><input id="custPhone" type="tel" placeholder="Phone number" style="width:100%"></label><br>
            <label>Address:<br><textarea id="custAddress" placeholder="Delivery address" style="width:100%" rows="3"></textarea></label>

            <div style="margin-top:12px;text-align:right;">
                <button id="payCancel">Cancel</button>
                <button id="payConfirm">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#payCancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#payConfirm').addEventListener('click', () => {
        const method = overlay.querySelector('input[name="pay"]:checked').value;
        const name = (overlay.querySelector('#custName').value || '').trim();
        const phone = (overlay.querySelector('#custPhone').value || '').trim();
        const address = (overlay.querySelector('#custAddress').value || '').trim();

        // basic validation
        if (!name) { alert('Please enter your name.'); return; }
        if (!phone || phone.length < 7) { alert('Please enter a valid phone number.'); return; }
        if (!address) { alert('Please enter your address.'); return; }

        overlay.remove();
        callback({ paymentMethod: method, name, phone, address });
    });
}

function showReceipt(paymentMethod) {
    // paymentMethod may be an object with name/phone/address
    let details = paymentMethod;
    let method = (typeof details === 'object' && details.paymentMethod) ? details.paymentMethod : details;
    const customerName = (typeof details === 'object' && details.name) ? details.name : '';
    const customerPhone = (typeof details === 'object' && details.phone) ? details.phone : '';
    const customerAddress = (typeof details === 'object' && details.address) ? details.address : '';

    const websiteName = document.title || 'Food Ordering Website';
    const gstPercent = 0.18; // 18% GST
    const subtotal = cart.reduce((s, c) => s + Number(c.price), 0);
    const gstAmount = Number((subtotal * gstPercent).toFixed(2));
    const totalWithGst = Number((subtotal + gstAmount).toFixed(2));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const itemsHtml = cart.map(c => {
        const qty = c.qty || 1;
        const unit = Number(c.price);
        const line = (qty * unit);
        return `
            <tr>
                <td>${escapeHtml(c.item)}</td>
                <td>${qty}</td>
                <td>₹${unit.toFixed(2)}</td>
                <td>₹${line.toFixed(2)}</td>
            </tr>`;
    }).join('');

    overlay.innerHTML = `
        <div class="modal receipt">
            <h2>Receipt</h2>
            <p><strong>${escapeHtml(websiteName)}</strong></p>
            <p>Customer: ${escapeHtml(customerName)}<br>Phone: ${escapeHtml(customerPhone)}<br>Address: ${escapeHtml(customerAddress)}</p>
            <table class="receipt-table">
                <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
                <tfoot>
                    <tr><td colspan="3">Subtotal</td><td>₹${subtotal.toFixed(2)}</td></tr>
                    <tr><td colspan="3">GST (18%)</td><td>₹${gstAmount.toFixed(2)}</td></tr>
                    <tr><td colspan="3"><strong>Total</strong></td><td><strong>₹${totalWithGst.toFixed(2)}</strong></td></tr>
                </tfoot>
            </table>
            <p>Payment Method: ${escapeHtml(method)}</p>
            <div style="margin-top:12px;text-align:right;">
                <button id="printReceipt">Print</button>
                <button id="closeReceipt">Close</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#printReceipt').addEventListener('click', () => window.print());
    overlay.querySelector('#closeReceipt').addEventListener('click', () => {
        // before clearing, record sale
        const isoDate = new Date().toISOString();
        const displayDate = new Date().toLocaleString();
        const record = {
            date: displayDate,
            isoDate,
            displayDate,
            items: cart.map(c => ({ item: c.item, price: c.price, qty: c.qty || 1 })),
            subtotal: Number(subtotal).toFixed(2),
            gst: Number(gstAmount).toFixed(2),
            totalWithGst: Number(totalWithGst).toFixed(2),
            paymentMethod: method,
            customer: { name: customerName, phone: customerPhone, address: customerAddress }
        };
        recordSale(record);

        overlay.remove();
        // clear cart UI and data
        cart = [];
        total = 0;
        document.getElementById("cartItems").innerHTML = "";
        updateTotalDisplay();
    });
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
}

// --- Search functionality: move matched food cards to the top and highlight them ---
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const container = document.querySelector('.food-container');

    // store original order of cards
    const originalCards = Array.from(container.children);

    function performSearch(q) {
        const query = String(q || '').trim().toLowerCase();

        if (!query) {
            // restore original order and remove highlights
            container.innerHTML = '';
            originalCards.forEach(c => {
                c.classList.remove('highlight');
                container.appendChild(c);
            });
            return;
        }

        const matches = originalCards.filter(card => {
            const nameEl = card.querySelector('p');
            const name = nameEl ? nameEl.textContent.toLowerCase() : '';
            return name.includes(query);
        });

        const nonMatches = originalCards.filter(c => !matches.includes(c));

        // re-append matched first, then non-matches
        container.innerHTML = '';
        matches.forEach(c => {
            c.classList.add('highlight');
            container.appendChild(c);
        });
        nonMatches.forEach(c => {
            c.classList.remove('highlight');
            container.appendChild(c);
        });
    }

    searchButton.addEventListener('click', () => performSearch(searchInput.value));
    searchInput.addEventListener('input', (e) => performSearch(e.target.value));

    // Header click -> show sales panel and hide product/cart area
    const header = document.getElementById('siteHeader');
    const salesPanel = document.getElementById('salesPanel');
    const searchBar = document.getElementById('searchBar');
    const foodContainer = document.getElementById('foodContainer');
    const cartEl = document.getElementById('cart');
    const backBtn = document.getElementById('backToShop');

    if (header && salesPanel) {
        header.style.cursor = 'pointer';
        header.addEventListener('click', () => {
            // show sales, hide other sections
            salesPanel.classList.add('show');
            if (searchBar) searchBar.style.display = 'none';
            if (foodContainer) foodContainer.style.display = 'none';
            if (cartEl) cartEl.style.display = 'none';
            // scroll to sales
            salesPanel.scrollIntoView({ behavior: 'smooth' });
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // hide sales and show shop
            if (salesPanel) salesPanel.classList.remove('show');
            if (searchBar) searchBar.style.display = '';
            if (foodContainer) foodContainer.style.display = '';
            if (cartEl) cartEl.style.display = '';
            // scroll to top/shop
            if (searchBar) searchBar.scrollIntoView({ behavior: 'smooth' });
        });
    }
});
