const express = require('express')
const db = require('../db')

const router = express.Router()

async function sendBrevoEmail(to, subject, textContent, htmlContent) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: process.env.EMAIL_FROM, name: 'Oluegwu Chigozie — OCATECH' },
      to: [{ email: to }],
      subject,
      textContent,
      htmlContent,
    }),
  })
  return response
}

router.post('/', async (req, res) => {
  const { name, email, phone, subject, message } = req.body

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: 'Name, email, subject, and message are required.' })
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' })
  }

  try {
    const stmt = db.prepare(
      'INSERT INTO contact_submissions (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)'
    )
    const result = stmt.run(name, email, phone || '', subject, message)

    // 1. Admin notification email
    const adminResponse = await sendBrevoEmail(
      process.env.EMAIL_TO,
      `Portfolio Contact: ${subject}`,
      `Name: ${name}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\n\nMessage:\n${message}`,
      `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'N/A'}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
      `
    )

    if (!adminResponse.ok) {
      const errorData = await adminResponse.json().catch(() => ({}))
      console.error('Brevo admin email error:', adminResponse.status, errorData)
      return res.status(502).json({ error: 'Failed to send message. Please try again later.' })
    }

    // 2. Acknowledgement email to the user (non-blocking)
    try {
      const ackResponse = await sendBrevoEmail(
        email,
        'Thank you for contacting OCATECH DIGITAL SOLUTION',
        `Hi ${name},\n\nThank you for reaching out! I've received your message regarding "${subject}" and will get back to you as soon as possible.\n\nIf you need immediate assistance, feel free to reach me on WhatsApp: https://wa.me/2348165321429\n\nBest regards,\nOluegwu Chigozie\nOCATECH DIGITAL SOLUTION`,
        `
          <h2>Thank you for reaching out!</h2>
          <p>Hi ${name},</p>
          <p>Thank you for contacting <strong>OCATECH DIGITAL SOLUTION</strong>. I've received your message regarding <em>"${subject}"</em> and will get back to you as soon as possible.</p>
          <p>If you need immediate assistance, feel free to reach me on <strong>WhatsApp</strong>: <a href="https://wa.me/2348165321429" target="_blank" rel="noopener noreferrer">08165321429</a></p>
          <hr>
          <p>Best regards,<br><strong>Oluegwu Chigozie</strong><br>OCATECH DIGITAL SOLUTION</p>
        `
      )

      if (!ackResponse.ok) {
        console.error('Brevo acknowledgement email failed:', ackResponse.status)
      }
    } catch (ackErr) {
      console.error('Acknowledgement email error:', ackErr.message)
    }

    res.status(201).json({ success: true, id: result.lastInsertRowid })
  } catch (err) {
    console.error('Contact form error:', err)
    res.status(500).json({ error: 'Failed to send message. Please try again later.' })
  }
})

module.exports = router
