initUI()

const article = document.querySelector('article')
const editor = new Editor(article, parseMarkdown)
article.addEventListener('input', debounce(500, save))
article.addEventListener('blur', save)
article.addEventListener('click', event => {
  if (event.target.tagName === 'A') window.open(event.target.getAttribute('href'), '_blank')
})
addEventListener('DOMContentLoaded', load)
addEventListener('hashchange', load)
addEventListener('load', () => new MutationObserver(save).observe(article, { attributeFilter: ['style'] }))
addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
    e.preventDefault()
    download()
  }
})
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
}

console.log('%cURLPad by Samin Yeasar\n%chttps://github.com/Solez-ai/url-pad', 'font-size: 18px; font-weight: bold; color: #0569fa;', 'font-size: 14px; color: #666; border: 1px solid #0569fa; border-radius: 8px; padding: 8px 12px; margin-top: 4px;')

async function load() {
  try {
    if (location.hash !== '') await set(location.hash)
    else {
      await set(localStorage.getItem('hash') ?? '')
      if (article.textContent) history.replaceState({}, '', await get())
    }
  } catch (e) {
    article.textContent = ''
    article.removeAttribute('style')
  }
  updateTitle()
}

async function save() {
  const hash = await get()
  if (location.hash !== hash) history.replaceState({}, '', hash)
  try {
    localStorage.setItem('hash', hash)
  } catch (e) {
  }
  updateTitle()
}

async function set(hash) {
  if (!hash) return
  const [content, style] = (await decompress(hash.slice(1))).split('\x00')
  editor.set(content)
  if (style) article.setAttribute('style', style)
}

async function get() {
  const style = article.getAttribute('style')
  const content = article.textContent + (style !== null ? '\x00' + style : '')
  return '#' + await compress(content)
}

function updateTitle() {
  const match = article.textContent.match(/^\n*#(.+)\n/)
  document.title = match?.[1] ?? 'URLPad'
}

async function compress(string) {
  const byteArray = new TextEncoder().encode(string)
  const stream = new CompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  writer.write(byteArray)
  writer.close()
  const buffer = await new Response(stream.readable).arrayBuffer()
  return new Uint8Array(buffer).toBase64({ alphabet: 'base64url' })
}

async function decompress(b64) {
  const byteArray = Uint8Array.fromBase64(b64, { alphabet: 'base64url' })
  const stream = new DecompressionStream('deflate-raw')
  const writer = stream.writable.getWriter()
  writer.write(byteArray)
  writer.close()
  const buffer = await new Response(stream.readable).arrayBuffer()
  return new TextDecoder().decode(buffer)
}

function debounce(ms, fn) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

async function download() {
  updateTitle()
  const doc = document.documentElement.cloneNode(true)
  doc.querySelectorAll('script').forEach(s => s.remove())
  doc.querySelectorAll('.noprint').forEach(s => s.remove())
  doc.querySelector('article').removeAttribute('contenteditable')
  const html = '<!DOCTYPE html>\n' + doc.outerHTML

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await showSaveFilePicker({
        suggestedName: document.title + '.html',
        types: [{
          description: 'HTML file',
          accept: { 'text/html': ['.html'] },
        }],
      })
      const writable = await handle.createWritable()
      await writable.write(html)
      await writable.close()
      return
    } catch (e) {
      if (e.name === 'AbortError') return
    }
  }

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = document.title + '.html'
  a.click()
  URL.revokeObjectURL(url)
}

function parseMarkdown(element) {
  const input = element.textContent
  const frag = document.createDocumentFragment()

  const matchers = [
    { name: 'md-codeblock', re: /```[^\n]*\n[\s\S]*?\n```/y },
    { name: 'md-codeblock', re: /~~~[^\n]*\n[\s\S]*?\n~~~/y },
    { name: 'md-h1', re: /^#[ \t]+[^\n]*$/my },
    { name: 'md-h2', re: /^##[ \t]+[^\n]*$/my },
    { name: 'md-h3', re: /^###[ \t]+[^\n]*$/my },
    { name: 'md-h4', re: /^####[ \t]+[^\n]*$/my },
    { name: 'md-h5', re: /^#####[ \t]+[^\n]*$/my },
    { name: 'md-h6', re: /^######[ \t]+[^\n]*$/my },
    { name: 'md-code', re: /`[^`\n]*`/y },
    { name: 'md-bold', re: /\*\*[^*\n]+?\*\*/y },
    { name: 'md-strike', re: /~~[^~\n]+?~~/y },
    { name: 'md-italic', re: /\*[^*\n]+?\*/y },
    { name: 'md-url', re: /https?:\/\/[^\s<>()\[\]{}\"'`]+/y },
  ]

  const specials = ['`', '~', '*', '#', 'h']

  let i = 0
  while (i < input.length) {
    let matched = false
    for (const m of matchers) {
      m.re.lastIndex = i
      const res = m.re.exec(input)
      if (res && res.index === i) {
        const raw = res[0]
        if (m.name === 'md-url') {
          const a = document.createElement('a')
          a.className = 'md-url'
          a.href = raw
          a.textContent = raw
          a.target = '_blank'
          a.rel = 'noopener noreferrer'
          frag.appendChild(a)
        } else {
          const span = document.createElement('span')
          span.className = m.name
          span.textContent = raw
          frag.appendChild(span)
        }
        i += raw.length
        matched = true
        break
      }
    }

    if (matched) continue

    let next = input.length
    for (const ch of specials) {
      const idx = input.indexOf(ch, i)
      if (idx !== -1 && idx < next) next = idx
    }

    if (next === i) {
      frag.appendChild(document.createTextNode(input[i]))
      i++
      continue
    }

    frag.appendChild(document.createTextNode(input.slice(i, next)))
    i = next
  }

  article.textContent = ''
  article.appendChild(frag)
  article.normalize()
}

function initUI() {
  const menu = document.querySelector('#menu')
  const button = document.querySelector('#button')
  const qr = document.querySelector('#qr')

  // Shortener UI elements
  const shortenBtn = document.querySelector('#shorten-btn')
  const modal = document.querySelector('#shorten-modal')
  const closeModal = document.querySelector('#close-modal')
  const startShorten = document.querySelector('#do-shorten')
  const toggleAdvanced = document.querySelector('#toggle-advanced')
  const advancedOptions = document.querySelector('#advanced-options')
  const resultArea = document.querySelector('#result-area')
  const shortUrlInput = document.querySelector('#short-url')
  const copyUrlBtn = document.querySelector('#copy-url')
  const termsTip = document.querySelector('#terms-tip')
  const customAlias = document.querySelector('#custom-alias')
  const password = document.querySelector('#password')
  const maxClicks = document.querySelector('#max-clicks')

  button.addEventListener('click', event => {
    ripple(event)
    menu.classList.toggle('visible')
    qr.setAttribute('href', '/qr' + location.hash)
  })

  document.body.addEventListener('click', event => {
    let t = event.target
    if (t.closest('#menu')) return
    if (t.closest('#button')) return
    if (t.closest('.ripple')) return
    if (t.closest('.modal')) return
    if (t.closest('#shorten-btn')) return
    menu.classList.remove('visible')
    if (t.classList.contains('modal-overlay')) {
      modal.classList.remove('visible')
    }
  })

  // Shortener Logic
  shortenBtn.addEventListener('click', () => {
    menu.classList.remove('visible')
    modal.classList.add('visible')
    resultArea.classList.remove('visible')
    startShorten.textContent = 'Shorten'
    startShorten.disabled = false
  })

  closeModal.addEventListener('click', () => {
    modal.classList.remove('visible')
  })

  toggleAdvanced.addEventListener('click', () => {
    advancedOptions.classList.toggle('visible')
  })

  startShorten.addEventListener('mouseover', () => {
    termsTip.style.display = 'block'
  })

  startShorten.addEventListener('mouseout', () => {
    termsTip.style.display = 'none'
  })

  startShorten.addEventListener('click', async () => {
    const longUrl = location.href
    startShorten.textContent = 'Shortening...'
    startShorten.disabled = true

    const payload = {
      long_url: longUrl
    }

    if (customAlias.value.trim()) payload.alias = customAlias.value.trim()
    if (password.value.trim()) payload.password = password.value.trim()
    if (maxClicks.value.trim()) payload.max_clicks = parseInt(maxClicks.value.trim())

    try {
      const response = await fetch('https://spoo.me/api/v1/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer spoo_CNbMn6UjivNriTIpAO5Aaf61TaiTuorfSvMtzegYUAg'
        },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (response.ok) {
        shortUrlInput.value = data.short_url
        resultArea.classList.add('visible')
        startShorten.textContent = 'Shortened!'
      } else {
        alert('Error: ' + (data.error || 'Unknown error occurred'))
        startShorten.textContent = 'Shorten'
        startShorten.disabled = false
      }
    } catch (e) {
      console.error(e)
      alert('Failed to connect to shortening service')
      startShorten.textContent = 'Shorten'
      startShorten.disabled = false
    }
  })

  copyUrlBtn.addEventListener('click', () => {
    shortUrlInput.select()
    document.execCommand('copy')
    copyUrlBtn.textContent = 'Copied!'
    setTimeout(() => copyUrlBtn.textContent = 'Copy', 2000)
  })
}

function ripple(event) {
  const button = event.currentTarget
  const circle = document.createElement('span')
  const diameter = Math.max(button.clientWidth, button.clientHeight)
  const radius = diameter / 2
  circle.style.width = circle.style.height = `${diameter}px`
  circle.style.left = `${(event.clientX || event.targetTouches[0].pageX) - button.offsetLeft - radius}px`
  circle.style.top = `${(event.clientY || event.targetTouches[0].pageY) - button.offsetTop - radius}px`
  circle.classList.add('ripple')
  const ripple = button.getElementsByClassName('ripple')[0]
  if (ripple) ripple.remove()
  button.appendChild(circle)
}

function Editor(element, highlight) {
  const listeners = []
  const history = []
  let at = -1, prev

  const debounceHighlight = debounce(30, () => {
    const pos = save()
    highlight(element)
    restore(pos)
  })

  const shouldRecord = (event) => {
    return !isUndo(event) && !isRedo(event)
      && event.key !== 'Meta'
      && event.key !== 'Control'
      && event.key !== 'Alt'
      && !event.key.startsWith('Arrow')
  }

  let recording = false
  const debounceRecordHistory = debounce(300, (event) => {
    if (shouldRecord(event)) {
      recordHistory()
      recording = false
    }
  })

  const on = (type, fn) => {
    listeners.push([type, fn])
    element.addEventListener(type, fn)
  }
  on('keydown', event => {
    if (event.defaultPrevented) return
    prev = toString()
    if (isUndo(event)) doUndo(event)
    if (isRedo(event)) doRedo(event)
    if (shouldRecord(event) && !recording) {
      recordHistory()
      recording = true
    }
  })
  on('keyup', event => {
    if (event.defaultPrevented) return
    if (event.isComposing) return
    if (prev !== toString()) debounceHighlight()
    debounceRecordHistory(event)
  })
  on('paste', () => setTimeout(recordHistory, 10))
  on('cut', () => setTimeout(recordHistory, 10))
  on('beforeinput', event => {
    if (event.inputType === 'historyUndo') doUndo(event)
    if (event.inputType === 'historyRedo') doRedo(event)
  })

  function save() {
    const s = getSelection()
    const pos = { start: 0, end: 0, dir: undefined }
    let { anchorNode, anchorOffset, focusNode, focusOffset } = s
    if (!anchorNode || !focusNode) throw 'error1'
    if (anchorNode === element && focusNode === element) {
      pos.start = (anchorOffset > 0 && element.textContent) ? element.textContent.length : 0
      pos.end = (focusOffset > 0 && element.textContent) ? element.textContent.length : 0
      pos.dir = (focusOffset >= anchorOffset) ? '->' : '<-'
      return pos
    }
    if (anchorNode.nodeType === Node.ELEMENT_NODE) {
      const node = document.createTextNode('')
      anchorNode.insertBefore(node, anchorNode.childNodes[anchorOffset])
      anchorNode = node
      anchorOffset = 0
    }
    if (focusNode.nodeType === Node.ELEMENT_NODE) {
      const node = document.createTextNode('')
      focusNode.insertBefore(node, focusNode.childNodes[focusOffset])
      focusNode = node
      focusOffset = 0
    }
    visit(element, el => {
      if (el === anchorNode && el === focusNode) {
        pos.start += anchorOffset
        pos.end += focusOffset
        pos.dir = anchorOffset <= focusOffset ? '->' : '<-'
        return 'stop'
      }
      if (el === anchorNode) {
        pos.start += anchorOffset
        if (!pos.dir) {
          pos.dir = '->'
        } else {
          return 'stop'
        }
      } else if (el === focusNode) {
        pos.end += focusOffset
        if (!pos.dir) {
          pos.dir = '<-'
        } else {
          return 'stop'
        }
      }
      if (el.nodeType === Node.TEXT_NODE) {
        if (pos.dir !== '->') pos.start += el.nodeValue.length
        if (pos.dir !== '<-') pos.end += el.nodeValue.length
      }
    })

    element.normalize()
    return pos
  }

  function restore(pos) {
    const s = getSelection()
    let startNode, startOffset = 0
    let endNode, endOffset = 0

    if (!pos.dir) pos.dir = '->'
    if (pos.start < 0) pos.start = 0
    if (pos.end < 0) pos.end = 0

    if (pos.dir === '<-') {
      const { start, end } = pos
      pos.start = end
      pos.end = start
    }

    let current = 0

    visit(element, el => {
      if (el.nodeType !== Node.TEXT_NODE) return

      const len = (el.nodeValue || '').length
      if (current + len > pos.start) {
        if (!startNode) {
          startNode = el
          startOffset = pos.start - current
        }
        if (current + len > pos.end) {
          endNode = el
          endOffset = pos.end - current
          return 'stop'
        }
      }
      current += len
    })

    if (!startNode) {
      startNode = element
      startOffset = element.childNodes.length
    }
    if (!endNode) {
      endNode = element
      endOffset = element.childNodes.length
    }

    if (pos.dir === '<-') {
      [startNode, startOffset, endNode, endOffset] = [endNode, endOffset, startNode, startOffset]
    }

    {
      const startEl = uneditable(startNode)
      if (startEl) {
        const node = document.createTextNode('')
        startEl.parentNode?.insertBefore(node, startEl)
        startNode = node
        startOffset = 0
      }
      const endEl = uneditable(endNode)
      if (endEl) {
        const node = document.createTextNode('')
        endEl.parentNode?.insertBefore(node, endEl)
        endNode = node
        endOffset = 0
      }
    }

    s.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
    element.normalize()
  }

  function uneditable(node) {
    while (node && node !== element) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.getAttribute('contenteditable') === 'false') {
          return node
        }
      }
      node = node.parentNode
    }
  }

  function doUndo(event) {
    preventDefault(event)
    at--
    const record = history[at]
    if (record) {
      element.innerHTML = record.html
      restore(record.pos)
    }
    if (at < 0) at = 0
  }

  function doRedo(event) {
    preventDefault(event)
    at++
    const record = history[at]
    if (record) {
      element.innerHTML = record.html
      restore(record.pos)
    }
    if (at >= history.length) at--
  }

  function recordHistory() {
    const html = element.innerHTML
    const pos = save()
    const lastRecord = history[at]
    if (
      lastRecord
      && lastRecord.html === html
      && lastRecord.pos.start === pos.start
      && lastRecord.pos.end === pos.end
    ) return
    at++
    history[at] = { html, pos }
    history.splice(at + 1)
    const maxHistory = 10_000
    if (at > maxHistory) {
      at = maxHistory
      history.splice(0, 1)
    }
  }

  function visit(editor, visitor) {
    const queue = []
    if (editor.firstChild) queue.push(editor.firstChild)
    let el = queue.pop()
    while (el) {
      if (visitor(el) === 'stop') break
      if (el.nextSibling) queue.push(el.nextSibling)
      if (el.firstChild) queue.push(el.firstChild)
      el = queue.pop()
    }
  }

  function isCtrl(event) {
    return event.metaKey || event.ctrlKey
  }

  function isUndo(event) {
    return isCtrl(event) && !event.shiftKey && event.code === 'KeyZ'
  }

  function isRedo(event) {
    return isCtrl(event) && event.shiftKey && event.code === 'KeyZ'
  }

  function toString() {
    return element.textContent || ''
  }

  function preventDefault(event) {
    event.preventDefault()
  }

  function getSelection() {
    return element.getRootNode().getSelection()
  }

  return {
    set(content) {
      element.textContent = content
      highlight(element)
    },
    destroy() {
      for (const [type, fn] of listeners) editor.removeEventListener(type, fn)
    },
  }
}
