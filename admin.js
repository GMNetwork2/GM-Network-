'use strict';

// --- Admin Dashboard Loading ---
async function loadAdmin() {
    if (!isAdmin) return;
    const [m, p, o, w] = await Promise.all([
        sb.from('profiles').select('id,full_name,member_code,points,total_commission,created_at').order('created_at', { ascending: false }).limit(20),
        sb.from('products').select('*').order('created_at', { ascending: false }),
        sb.from('orders').select('*').order('created_at', { ascending: false }).limit(20),
        sb.from('withdrawals').select('*, profiles(full_name)').order('created_at', { ascending: false }).limit(10)
    ]);

    $('am').textContent = '500';
    $('ap').textContent = p.error ? '—' : String(p.data?.length || 0);
    $('ao').textContent = o.error ? '—' : String(o.data?.length || 0);

    // Orders List
    $('adminOrders').innerHTML = o.error ? esc(o.error.message) : (o.data || []).map(x => `
        <div class="item" data-order="${esc(x.id)}" style="cursor:pointer">
            <div><b>Order …${esc(String(x.id).slice(-4))}</b><br><small>${esc(x.phone_number)} • ${convertMoney(x.unit_price_pkr)}</small></div>
            <span class="pill">${esc(x.status)}</span>
        </div>`).join('') || 'No orders yet.';

    $('adminOrders').querySelectorAll('[data-order]').forEach(el => {
        const x = (o.data || []).find(r => String(r.id) === el.dataset.order);
        if (x) el.onclick = () => showOrderDetails(x.id, x.phone_number, x.shipping_address, x.status, 'Order ID: ' + String(x.id).slice(-6), x.unit_price_pkr, x.buyer_id, x.payment_proof);
    });

    // Withdraw Requests
    $('adminWithdrawals').innerHTML = w.error ? esc(w.error.message) : (w.data || []).map(x => `
        <div class="item">
            <div><b>${esc(x.profiles?.full_name || 'User')}</b><br><small>${esc(x.account_details)}</small></div>
            <div><b>${convertMoney(x.amount)}</b><br><span class="pill">${esc(x.status || 'pending')}</span></div>
        </div>`).join('') || 'No requests yet.';

    // Members List (with Edit Coins/Comm and View Team buttons)
    $('adminMembers').innerHTML = m.error ? esc(m.error.message) : (m.data || []).map(x => {
        const coins = Number(x.points || 0), comm = Number(x.total_commission || 0);
        let level = 'Bronze 🥉';
        if (coins >= 50000) level = 'Diamond 💎';
        else if (coins >= 10000) level = 'Gold 🥇';
        else if (coins >= 3000) level = 'Silver 🥈';

        return `<div class="item">
            <div>
                <b>${esc(x.full_name)}</b> <span class="pill" style="background:var(--gold);color:var(--g)">${level}</span><br>
                <small>${esc(x.member_code)}</small><br>
                <small class="muted">Coins: <b>${coins.toLocaleString()}</b> | Comm: <b>$${comm}</b></small>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px">
                <button class="secondary small-btn" data-edit-coins="${esc(x.id)}">Edit Coins/Comm</button>
                <button class="secondary small-btn" data-view-team="${esc(x.id)}" data-member-name="${esc(x.full_name || 'Member')}">View Team</button>
            </div>
        </div>`;
    }).join('') || 'No members yet.';

    $('adminMembers').querySelectorAll('[data-edit-coins]').forEach(btn => {
        const member = (m.data || []).find(x => x.id === btn.dataset.editCoins);
        btn.onclick = () => editMemberPoints(btn.dataset.editCoins, Number(member?.points || 0));
    });

    $('adminMembers').querySelectorAll('[data-view-team]').forEach(btn => {
        btn.onclick = () => viewMemberTeam(btn.dataset.viewTeam, btn.dataset.memberName || 'Member');
    });

    // Manage Products
    $('adminManageProducts').innerHTML = p.error ? esc(p.error.message) : (p.data || []).map(x => `
        <div class="item">
            <div><b>${esc(x.name)}</b><br><small>${convertMoney(x.price_pkr)} • ${x.active ? 'Active' : 'Inactive'}</small></div>
            <div class="row-actions">
                <button class="secondary" data-edit="${esc(x.id)}">Edit</button>
                <button class="secondary" data-toggle="${esc(x.id)}">${x.active ? 'Deactivate' : 'Activate'}</button>
                <button class="secondary" data-delete="${esc(x.id)}">Delete</button>
            </div>
        </div>`).join('') || 'No products yet.';

    $('adminManageProducts').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editProduct(b.dataset.edit));
    $('adminManageProducts').querySelectorAll('[data-toggle]').forEach(b => {
        const x = p.data.find(x => x.id === b.dataset.toggle);
        b.onclick = () => toggleProduct(x.id, x.active);
    });
    $('adminManageProducts').querySelectorAll('[data-delete]').forEach(b => b.onclick = () => deleteProduct(b.dataset.delete));
}

// --- Search Member ---
async function searchAdminMember() {
    const query = $('adminSearchInput').value.trim();
    if (!query) return alert('Please enter Member ID or Name.');
    $('adminSearchResult').textContent = 'Searching...';

    const { data, error } = await sb.from('profiles').select('*').or(`member_code.ilike.%${query}%,full_name.ilike.%${query}%`);
    if (error) { $('adminSearchResult').textContent = 'Error: ' + error.message; return; }
    if (!data || data.length === 0) { $('adminSearchResult').textContent = 'No member found.'; return; }

    $('adminSearchResult').innerHTML = data.map(x => `
        <div class="item">
            <div><b>${esc(x.full_name)}</b><br><small>${esc(x.member_code)}</small><br><small class="muted">Coins: <b>${Number(x.points || 0).toLocaleString()}</b> | Comm: <b>$${Number(x.total_commission || 0)}</b></small></div>
            <div><button class="secondary small-btn" onclick="editMemberPoints('${esc(x.id)}',${Number(x.points || 0)})">Edit Coins/Comm</button></div>
        </div>`).join('');
}

// --- Edit Member (Coins, Commission, and Sales) ---
async function editMemberPoints(userId, currentPoints) {
    if (!isAdmin) return alert('Admin access required.');

    const newPoints = prompt('Enter new coin balance for this member:', currentPoints);
    if (newPoints === null || newPoints.trim() === '') return;
    const pointsNum = Number(newPoints);
    if (!Number.isInteger(pointsNum) || pointsNum < 0) return alert('Invalid number. Enter a whole number zero or greater.');

    const { data: profileData, error: fetchErr } = await sb.from('profiles').select('total_commission').eq('id', userId).single();
    if (fetchErr) return alert('Could not load current data: ' + fetchErr.message);

    const currentComm = Number(profileData.total_commission || 0);
    const newCommStr = prompt('Enter new Total Commission in USD ($) for this member:', currentComm);
    if (newCommStr === null || newCommStr.trim() === '') return;
    const commNum = Number(newCommStr);
    if (!Number.isFinite(commNum) || commNum < 0) return alert('Invalid commission amount. Enter a valid number.');

    const { count: currentSales } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('referrer_id', userId).in('status', ['confirmed', 'delivered']);
    const newSalesStr = prompt('Enter manual "My Sales" count for this member (0 if none):', currentSales || 0);
    if (newSalesStr === null || newSalesStr.trim() === '') return;
    const salesNum = Number(newSalesStr);
    if (!Number.isInteger(salesNum) || salesNum < 0) return alert('Invalid sales number. Enter a whole number zero or greater.');

    // Sales is collected above but not saved because no manual-sales column is specified.
    const { data, error } = await sb.from('profiles').update({
        points: pointsNum,
        total_commission: commNum
    }).eq('id', userId).select();

    if (error) {
        alert('Error updating data: ' + error.message);
    } else if (!data || data.length === 0) {
        alert('Update failed silently. Please check your Supabase RLS policies.');
    } else {
        alert('Coins and Commission updated successfully!');
        await loadAdmin();
        if (user && user.id === userId) {
            if (typeof loadProfile === 'function') await loadProfile();
            if (typeof loadMyAccountPage === 'function') await loadMyAccountPage();
        }
    }
}

// --- Order Details Modal ---
async function showOrderDetails(id, phone, address, orderStatus, name, price, buyerId, paymentProof) {
    $('orderDetailName').textContent = name || ('Order …' + String(id).slice(-6));
    $('orderDetailPhone').textContent = phone || '—';
    $('orderDetailAddress').textContent = address || '—';
    $('orderDetailPrice').textContent = convertMoney(price);
    $('orderDetailStatus').textContent = String(orderStatus || 'unknown').toUpperCase();
    $('orderDetailUserId').textContent = buyerId ? '...' + String(buyerId).slice(-8) : '—';
    $('orderDetailMemberCode').textContent = 'Loading…';

    if (buyerId) {
        const { data: customerProfile, error: customerProfileError } = await sb.from('profiles').select('full_name,member_code').eq('id', buyerId).maybeSingle();
        if (!customerProfileError && customerProfile) {
            $('orderDetailMemberCode').textContent = customerProfile.member_code || 'Member ID not assigned';
            if (customerProfile.full_name) $('orderDetailName').textContent = customerProfile.full_name + ' • ' + String(id).slice(-6);
        } else {
            $('orderDetailMemberCode').textContent = 'Member profile not found';
        }
    } else {
        $('orderDetailMemberCode').textContent = '—';
    }

    const proofBox = $('paymentProofBox');
    proofBox.innerHTML = '';
    if (paymentProof) {
        proofBox.innerHTML = `<div class="item"><span>Payment Proof</span><a href="${esc(paymentProof)}" target="_blank" rel="noopener noreferrer" style="color:var(--g); font-weight:bold;">View Screenshot</a></div>`;
    } else {
        proofBox.innerHTML = `<div class="item"><span>Payment Proof</span><b class="muted">Not uploaded</b></div>`;
    }

    if (isAdmin) {
        const changeBox = document.createElement('div');
        changeBox.className = 'item';
        changeBox.innerHTML = `<span>Change Proof</span><input type="file" id="adminProofUpload" accept="image/*" style="width:auto;"><button class="primary small-btn" onclick="adminChangeProof('${esc(id)}')">Upload</button>`;
        proofBox.append(changeBox);
    }

    const actionDiv = $('orderActionButtons');
    actionDiv.innerHTML = '';

    if (!isAdmin) {
        if (user && user.id === buyerId && orderStatus === 'confirmed') {
            const btn = document.createElement('button');
            btn.className = 'primary';
            btn.textContent = 'I Received My Order';
            btn.onclick = () => markAsDelivered(id);
            actionDiv.append(btn);
        }
    } else {
        const label = document.createElement('label');
        label.textContent = 'Change Order Status:';
        label.style.display = 'block';
        label.style.margin = '12px 0 6px';

        const select = document.createElement('select');
        select.id = 'admin-status-dropdown';
        select.style.width = '100%';
        select.style.padding = '10px';

        [['pending', 'Pending'], ['confirmed', 'Confirmed'], ['delivered', 'Delivered'], ['cancelled', 'Rejected / Cancelled'], ['refunded', 'Refunded']].forEach(([value, text]) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = text;
            if (value === orderStatus) opt.selected = true;
            select.append(opt);
        });

        const btn = document.createElement('button');
        btn.className = 'primary';
        btn.style.marginTop = '10px';
        btn.textContent = 'Save Order Status';
        btn.onclick = () => updateOrderStatus(id, select.value);

        actionDiv.append(label, select, btn);
    }

    $('orderDetailModal').classList.remove('hidden');
}

function closeOrderDetailModal() { $('orderDetailModal').classList.add('hidden'); }

// --- Admin Change Proof ---
async function adminChangeProof(orderId) {
    const fileInput = $('adminProofUpload'), file = fileInput?.files?.[0];
    if (!file) return alert('Please select a screenshot to upload.');

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `payments/admin-${orderId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('product-images').upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
    if (uploadError) return alert('Upload failed: ' + uploadError.message);

    const { data: { publicUrl } } = sb.storage.from('product-images').getPublicUrl(path);
    const { error: updateError } = await sb.from('orders').update({ payment_proof: publicUrl }).eq('id', orderId);

    if (updateError) return alert('Database update failed: ' + updateError.message);

    alert('Proof updated successfully.');
    await loadAdmin();
    closeOrderDetailModal();
}

// --- Update Order Status (Confirm/Cancel/Deliver) ---
async function updateOrderStatus(orderId, newStatus) {
    if (!isAdmin) return alert('Admin access required.');
    const allowedStatuses = ['pending', 'confirmed', 'delivered', 'cancelled', 'refunded'];
    if (!allowedStatuses.includes(String(newStatus).toLowerCase())) return alert('Invalid order status.');

    newStatus = String(newStatus).toLowerCase();
    if (!confirm('Are you sure you want to mark this order as ' + newStatus + '?')) return;

    const { data: currentOrder, error: orderReadError } = await sb.from('orders').select('status, buyer_id, unit_price_pkr').eq('id', orderId).single();
    if (orderReadError || !currentOrder) return alert('Could not load order: ' + (orderReadError?.message || 'Order not found.'));

    const previousStatus = currentOrder.status;
    const { error: updateError } = await sb.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (updateError) return alert('Error updating order: ' + updateError.message);

    if (previousStatus === 'confirmed' && (newStatus === 'cancelled' || newStatus === 'refunded')) {
        const price = Number(currentOrder.unit_price_pkr), buyerId = currentOrder.buyer_id, coinsToRemove = Math.floor(price);

        if (coinsToRemove > 0) {
            const { data: buyerProfile, error: buyerReadError } = await sb.from('profiles').select('points').eq('id', buyerId).single();
            if (!buyerReadError && buyerProfile) {
                const { error: pointsError } = await sb.from('profiles').update({ points: Math.max(0, Number(buyerProfile.points || 0) - coinsToRemove) }).eq('id', buyerId);
                if (pointsError) alert('Order status changed, but buyer coin reversal failed: ' + pointsError.message);
            }
        }
        const { error: ledgerError } = await sb.from('commission_ledger').delete().eq('order_id', orderId);
        if (ledgerError) {
            alert('Order status changed, but ledger reversal failed: ' + ledgerError.message);
        } else {
            alert('Order cancelled/refunded. Buyer coins and commission ledger reversed.');
        }
    } else if (newStatus === 'confirmed' && previousStatus !== 'confirmed') {
        const price = Number(currentOrder.unit_price_pkr), buyerId = currentOrder.buyer_id, coinsToAdd = Math.floor(price);

        if (coinsToAdd > 0) {
            const { data: buyerProfile, error: buyerReadError } = await sb.from('profiles').select('points').eq('id', buyerId).single();
            if (buyerReadError || !buyerProfile) {
                alert('Order confirmed, but buyer coin balance could not be loaded.');
                await loadAdmin();
                return;
            }
            const { error: pointsError } = await sb.from('profiles').update({ points: Number(buyerProfile.points || 0) + coinsToAdd }).eq('id', buyerId);
            if (pointsError) {
                alert('Order confirmed, but buyer coins could not be added: ' + pointsError.message);
                await loadAdmin();
                return;
            }
        }

        const { error: commissionError } = await sb.rpc('get_upline_commissions', { buyer_id: buyerId, order_amount: price, coins_per_dollar: 1 });
        if (commissionError) {
            alert('Order confirmed and buyer coins added, but commission distribution failed: ' + commissionError.message);
        } else {
            alert('Order confirmed. Buyer coins and commission distribution processed.');
        }
    } else {
        alert('Order status updated to ' + newStatus);
    }

    closeOrderDetailModal();
    await loadAdmin();
}

// --- Mark as Delivered (Customer Action) ---
async function markAsDelivered(orderId) {
    if (!user || !sb) return alert('Please sign in to confirm delivery.');
    if (!confirm('کیا آپ نے واقعی اپنا آرڈر وصول کر لیا ہے؟')) return;

    const { data: order, error: readError } = await sb.from('orders').select('id,status,buyer_id').eq('id', orderId).eq('buyer_id', user.id).single();
    if (readError || !order) return alert('آرڈر لوڈ نہیں ہو سکا: ' + (readError?.message || 'Order not found.'));
    if (order.status !== 'confirmed') return alert('صرف confirmed آرڈر کی ڈیلیوری کنفرم کی جا سکتی ہے۔ موجودہ اسٹیٹس: ' + order.status);

    const { data: updatedOrder, error } = await sb.from('orders').update({ status: 'delivered' }).eq('id', orderId).eq('buyer_id', user.id).eq('status', 'confirmed').select('id').maybeSingle();
    if (error || !updatedOrder) return alert('ڈیلیوری اسٹیٹس اپڈیٹ نہیں ہوا: ' + (error?.message || 'آپ کو اس آرڈر کا اسٹیٹس تبدیل کرنے کی اجازت نہیں ہے۔'));

    alert('شکریہ! آپ کا آرڈر ڈیلیور شدہ مارک ہو گیا ہے۔');
    closeOrderDetailModal();
    if (typeof loadMyAccountPage === 'function') await loadMyAccountPage();
    if (isAdmin) await loadAdmin();
}

// --- Product Management (Add/Edit/Delete) ---
async function editProduct(id) {
    if (!isAdmin) return alert('Admin access required.');
    const { data: product, error } = await sb.from('products').select('*').eq('id', id).single();
    if (error || !product) return alert('Could not load product: ' + (error?.message || 'Product not found.'));

    $('editProductId').value = product.id;
    $('editProductName').value = product.name || '';
    $('editProductPrice').value = Number(product.price_pkr || 0);
    $('editProductRate').value = Number(product.commission_percent || 0);
    $('editProductImages').value = '';
    $('editProductStatus').classList.add('hidden');
    $('editProductModal').classList.remove('hidden');
}

async function saveProductEdit() {
    if (!isAdmin) return status('editProductStatus', 'Admin access required.', 'error');
    const id = $('editProductId').value, name = $('editProductName').value.trim(), price = Number($('editProductPrice').value), rate = Number($('editProductRate').value), files = $('editProductImages').files;

    if (!name || !Number.isFinite(price) || price < 1) return status('editProductStatus', 'Enter a product name and valid price.', 'error');
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) return status('editProductStatus', 'Commission must be between 0 and 50%.', 'error');

    status('editProductStatus', 'Saving changes…');
    const update = { name, price_pkr: price, commission_percent: rate };

    if (files && files.length > 0) {
        const images = [];
        for (let i = 0; i < Math.min(4, files.length); i++) {
            const file = files[i], ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg', path = `products/${Date.now()}-${i}-${cryptoRandom()}.${ext}`;
            const { error: uploadError } = await sb.storage.from('product-images').upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
            if (uploadError) return status('editProductStatus', 'Image upload failed: ' + uploadError.message, 'error');
            const url = sb.storage.from('product-images').getPublicUrl(path).data?.publicUrl;
            if (url) images.push(url);
        }
        if (images.length) { update.images = images; update.image_url = images[0]; }
    }

    const { error } = await sb.from('products').update(update).eq('id', id);
    if (error) return status('editProductStatus', 'Update failed: ' + error.message, 'error');

    status('editProductStatus', 'Product updated successfully.', 'ok');
    if (typeof loadProducts === 'function') await loadProducts();
    await loadAdmin();
    setTimeout(() => $('editProductModal').classList.add('hidden'), 700);
}

async function toggleProduct(id, current) {
    if (!isAdmin) return alert('Admin access required.');
    const { error } = await sb.from('products').update({ active: !current }).eq('id', id);
    if (error) alert('Update failed: ' + error.message);
    else { await loadAdmin(); if (typeof loadProducts === 'function') await loadProducts(); }
}

async function deleteProduct(id) {
    if (!isAdmin) return alert('Admin access required.');
    if (!confirm('Delete this product?')) return;
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) alert('Delete failed: ' + error.message);
    else { await loadAdmin(); if (typeof loadProducts === 'function') await loadProducts(); }
}

async function addOnlineProduct() {
    if (!isAdmin) return status('adminStatus', 'Admin access required.', 'error');
    const name = $('newProduct').value.trim(), price = Number($('newPrice').value), rate = Number($('newRate').value), files = $('newImageFiles').files;

    if (!name || !Number.isFinite(price) || price < 1) return status('adminStatus', 'Enter a product name and valid price.', 'error');
    if (!Number.isFinite(rate) || rate < 0 || rate > 50) return status('adminStatus', 'Commission must be between 0 and 50%.', 'error');

    status('adminStatus', 'Saving product…');
    const images = [];

    if (files && files.length > 0) {
        for (let i = 0; i < Math.min(4, files.length); i++) {
            const file = files[i], ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg', path = `products/${Date.now()}-${i}-${cryptoRandom()}.${ext}`;
            const { error: uploadError } = await sb.storage.from('product-images').upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
            if (uploadError) return status('adminStatus', 'Image upload failed: ' + uploadError.message, 'error');
            const url = sb.storage.from('product-images').getPublicUrl(path).data?.publicUrl;
            if (url) images.push(url);
        }
    }

    const { error } = await sb.from('products').insert({ name, price_pkr: price, commission_percent: rate, images, image_url: images[0] || null, active: true });
    if (error) return status('adminStatus', 'Save failed: ' + error.message, 'error');

    $('newProduct').value = ''; $('newPrice').value = ''; $('newImageFiles').value = ''; $('newRate').value = '5';
    status('adminStatus', 'Product saved.', 'ok');

    if (typeof loadProducts === 'function') await loadProducts();
    await loadAdmin();
}

// --- View Member Team (Admin Action) ---
async function viewMemberTeam(userId, name) {
    if (!isAdmin) return alert('Admin access required.');
    const { data, error } = await sb.from('profiles').select('full_name, member_code').eq('referred_by', userId).order('created_at', { ascending: true });
    if (error) return alert('Error loading team: ' + error.message);
    if (!data || data.length === 0) return alert(`Team of ${name}: No members yet.`);

    let teamList = `Team of ${name}:\n\n`;
    data.forEach((member, i) => { teamList += `${i + 1}. ${member.full_name || 'Member'} (${member.member_code || 'No code'})\n`; });
    alert(teamList);
}
