async function saveAnnotation({ writeDatabase, writeCaption }, request) {
  let databaseSaved = false
  let captionSaved = false

  try {
    await writeDatabase(request)
    databaseSaved = true
  } catch (error) {
    return {
      success: false,
      partial: false,
      databaseSaved,
      captionSaved,
      error: error.message,
    }
  }

  try {
    const captionPath = await writeCaption(request)
    captionSaved = true
    return {
      success: true,
      partial: false,
      databaseSaved,
      captionSaved,
      captionPath,
    }
  } catch (error) {
    return {
      success: false,
      partial: true,
      databaseSaved,
      captionSaved,
      error: error.message,
    }
  }
}

module.exports = { saveAnnotation }
