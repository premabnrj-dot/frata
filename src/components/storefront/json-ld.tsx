/** Structured data in a script tag. Merchant text is inside, so `<` is escaped: no `</script>` can close it early. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
