package drive

import (
	"io"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
)

// readFileContent returns a ReadCloser for the file blob attached to a drive_items record.
// The caller must close the returned reader.
func readFileContent(app *pocketbase.PocketBase, record *core.Record) (io.ReadCloser, error) {
	filename := record.GetString("file")
	if filename == "" {
		return io.NopCloser(&emptyReader{}), nil
	}

	fsys, err := app.NewFilesystem()
	if err != nil {
		return nil, err
	}

	key := record.BaseFilesPath() + "/" + filename
	reader, err := fsys.GetReader(key)
	if err != nil {
		fsys.Close()
		return nil, err
	}

	return &fsClosingReader{reader: reader, fsys: fsys}, nil
}

// writeFileContent reads the body, stores it as a PocketBase file on the record, and saves.
func writeFileContent(app *pocketbase.PocketBase, record *core.Record, body io.Reader, filename string) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}

	f, err := filesystem.NewFileFromBytes(data, filename)
	if err != nil {
		return err
	}

	record.Set("file", f)
	record.Set("size", len(data))

	return app.Save(record)
}

// fsClosingReader wraps an io.ReadCloser and closes the filesystem when the reader is closed.
type fsClosingReader struct {
	reader io.ReadCloser
	fsys   *filesystem.System
}

func (r *fsClosingReader) Read(p []byte) (int, error) {
	return r.reader.Read(p)
}

func (r *fsClosingReader) Close() error {
	err := r.reader.Close()
	r.fsys.Close()
	return err
}

type emptyReader struct{}

func (r *emptyReader) Read(_ []byte) (int, error) {
	return 0, io.EOF
}
