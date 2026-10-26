'use strict';

// --- Products Loading ---
async function loadProducts() {
    if (!sb) return;
    const el = $('productList');
    const { data, error } = await sb.from('products').select('*').eq('active', true).order('created_at', { ascending: false });
    
    if (error) {
        el.innerHTML = '<span class="status error">Could not load products: ' + esc(error.message) + '</span>';
        return;
    }
    
    el.innerHTML = (data || []).map(p => {
        const imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : ['https://placehold.co/100x100?text=GM']);
        return `<div class="product-card">
            <img src="${esc(imgs[0])}" class="main-img" alt="${esc(p.name)}" onclick="openImageLightbox(this.src, JSON.parse(decodeURIComponent(this.dataset.images)))" data-images="${encodeURIComponent(JSON.stringify(imgs))}">
            <div class="thumbnails">${imgs.map((img, i) => `<img src="${esc(img)}" class="${i === 0 ? 'active' : ''}" onclick="const card=this.closest('.product-card');card.querySelector('.main-img').src=this.src;card.querySelectorAll('.thumbnails img').forEach(x=>x.classList.remove('active'));this.classList.add('active');">`).join('')}</div>
            <div class="product-info"><h3>${esc(p.name)}</h3><div class="price">${convertMoney(p.price_pkr)}</div></div>
            <div class="muted">Commission: ${Number(p.commission_percent) || 0}%</div>
            <button class="primary buy-btn" data-product="${esc(p.id)}">Buy Now</button>
        </div>`;
    }).join('') || '<p class="muted">No active products yet.</p>';
    
    el.querySelectorAll('[data-product]').forEach((btn, i) => btn.addEventListener('click', () => {
        const p = data[i];
        openOrder(p.id, p.name, p.price_pkr);
    }));
    
    $('np').textContent = String((data || []).length);
}

// --- My Team Loading ---
async function loadMyTeam() {
    const el = $('teamList');
    if (!user) { el.textContent = 'Please sign in first.'; return; }
    const { data, error } = await sb.from('profiles').select('full_name,member_code').eq('referred_by', user.id);
    if (error) {
        el.innerHTML = '<span class="status error">Could not load team: ' + esc(error.message) + '</span>';
        return;
    }
    el.innerHTML = (data || []).map(x => `<div class="item"><span>${esc(x.full_name)}</span><span class="pill">${esc(x.member_code)}</span></div>`).join('') || '<p class="muted">No team members yet.</p>';
}

// --- Image Lightbox ---
let lightboxImages = [], lightboxIndex = 0, lightboxTouchStart = null;

function renderLightbox() {
    if (!lightboxImages.length) return;
    const img = lightboxImages[lightboxIndex];
    $('lightboxImage').src = img;
    $('lightboxCounter').textContent = (lightboxIndex + 1) + ' / ' + lightboxImages.length;
    $('lightboxThumbs').querySelectorAll('img').forEach((el, i) => {
        el.classList.toggle('active', i === lightboxIndex);
        if (i === lightboxIndex) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
}

function moveLightbox(delta) {
    if (!lightboxImages.length) return;
    lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
    renderLightbox();
}

function openImageLightbox(src, allImages) {
    if (!src) return;
    lightboxImages = Array.isArray(allImages) && allImages.length ? allImages : [src];
    lightboxIndex = Math.max(0, lightboxImages.indexOf(src));
    const thumbs = $('lightboxThumbs');
    thumbs.innerHTML = '';
    lightboxImages.forEach((img, i) => {
        const t = document.createElement('img');
        t.src = img;
        t.alt = 'Image ' + (i + 1);
        t.onclick = () => { lightboxIndex = i; renderLightbox(); };
        thumbs.appendChild(t);
    });
    $('imageLightbox').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    renderLightbox();
}

$('lightboxImage').addEventListener('touchstart', e => { lightboxTouchStart = e.changedTouches[0]?.clientX ?? null; }, { passive: true });
$('lightboxImage').addEventListener('touchend', e => {
    if (lightboxTouchStart === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? lightboxTouchStart) - lightboxTouchStart;
    if (Math.abs(dx) > 45) moveLightbox(dx < 0 ? 1 : -1);
    lightboxTouchStart = null;
}, { passive: true });

function closeImageLightbox() {
    $('imageLightbox').classList.add('hidden');
    $('lightboxImage').src = '';
    $('lightboxThumbs').innerHTML = '';
    document.body.style.overflow = '';
}

// Keyboard events for Lightbox and Modals
document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' && !$('imageLightbox').classList.contains('hidden')) moveLightbox(1);
    if (e.key === 'ArrowLeft' && !$('imageLightbox').classList.contains('hidden')) moveLightbox(-1);
    if (e.key === 'Escape') {
        closeImageLightbox();
        $('orderModal').classList.add('hidden');
        $('withdrawModal').classList.add('hidden');
        if (typeof closeOrderDetailModal === 'function') closeOrderDetailModal();
    }
});

// --- Order Functions ---
function openOrder(id, name, price) {
    if (!user) return alert('Please sign in first to place an order.');
    if (!myProfile) return alert('Your profile is not ready. Please refresh or sign in again.');
    currentProduct = { id, name, price: Number(price) || 0 };
    $('orderProductName').textContent = 'Product: ' + name + ' — ' + convertMoney(price);
    $('orderFormContent').classList.remove('hidden');
    $('paymentContent').classList.add('hidden');
    $('orderModal').classList.remove('hidden');
    $('orderStatus').classList.add('hidden');
}

function closeModal() { $('orderModal').classList.add('hidden'); }

async function submitOrder() {
    if (!user || !currentProduct || !sb) return;
    const name = $('orderName').value.trim(), phone = $('orderPhone').value.trim(), address = $('orderAddress').value.trim();
    if (!name || !phone || !address) return alert('Please fill in all fields.');
    
    status('orderStatus', 'Placing order…');
    const orderPayload = {
        buyer_id: user.id, buyer_email: user.email || null,
        product_id: currentProduct.id, quantity: 1,
        unit_price_pkr: currentProduct.price,
        phone_number: phone, shipping_address: address,
        status: 'pending', referrer_id: myProfile?.referred_by || null
    };
    
    let result = await sb.from('orders').insert(orderPayload).select('id').single();
    if (result.error && /buyer_email|schema cache|column/i.test(result.error.message || '')) {
        result = await sb.from('orders').insert({
            buyer_id: user.id, product_id: currentProduct.id, quantity: 1,
            unit_price_pkr: currentProduct.price, phone_number: phone,
            shipping_address: address, status: 'pending', referrer_id: myProfile?.referred_by || null
        }).select('id').single();
    }
    
    const { data: order, error } = result;
    if (error) { status('orderStatus', 'Order failed: ' + error.message, 'error'); return; }
    
    currentOrderId = order?.id || null;
    $('orderFormContent').classList.add('hidden');
    $('paymentContent').classList.remove('hidden');
    $('payAmount').textContent = convertMoney(currentProduct.price);
    
    const msg = encodeURIComponent(`Hi, I placed order ${currentOrderId || ''} for ${currentProduct.name} (${convertMoney(currentProduct.price)}). My Name: ${name}, Phone: ${phone}. I will send the payment screenshot.`);
    $('whatsappBtn').href = `https://wa.me/92${MY_EASYPAISA.replace(/^0/, '')}?text=${msg}`;
    
    $('orderName').value = ''; $('orderPhone').value = ''; $('orderAddress').value = '';
}

// --- Upload Payment Proof ---
async function uploadPaymentProof() {
    if (!currentOrderId) return alert("Order ID not found. Please refresh.");
    const fileInput = $('paymentScreenshot'), file = fileInput.files[0];
    if (!file) return alert("Please select a screenshot of your payment first.");
    
    status('uploadStatus', 'Uploading proof...');
    const ext = file.name.split('.').pop(), path = `payments/${currentOrderId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('product-images').upload(path, file);
    
    if (uploadError) { status('uploadStatus', 'Upload failed: ' + uploadError.message, 'error'); return; }
    
    const { data: { publicUrl } } = sb.storage.from('product-images').getPublicUrl(path);
    const { error: updateError } = await sb.from('orders').update({ payment_proof: publicUrl }).eq('id', currentOrderId);
    
    if (updateError) status('uploadStatus', 'Database update failed: ' + updateError.message, 'error');
    else {
        status('uploadStatus', '✅ Proof submitted successfully! Admin will verify your payment and confirm your order soon.', 'ok');
        setTimeout(() => closeModal(), 3000);
    }
}
