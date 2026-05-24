import React from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    [{ align: [] }],
    ['link'],
    ['clean'],
  ],
};

const formats = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'color', 'background', 'list', 'bullet', 'indent', 'align', 'link',
];

export default function RichTextEditor({ value, onChange, placeholder, minHeight = 150 }) {
  return (
    <div className="rich-text-editor-wrapper">
      <style>{`
        .rich-text-editor-wrapper .ql-container {
          min-height: ${minHeight}px;
          font-size: 14px;
          font-family: inherit;
        }
        .rich-text-editor-wrapper .ql-editor {
          min-height: ${minHeight}px;
          white-space: pre-wrap;
        }
        .rich-text-editor-wrapper .ql-editor.ql-blank::before {
          color: #94a3b8;
          font-style: normal;
        }
        .rich-text-editor-wrapper .ql-toolbar {
          border-radius: 6px 6px 0 0;
          background: #f8fafc;
        }
        .rich-text-editor-wrapper .ql-container {
          border-radius: 0 0 6px 6px;
        }
      `}</style>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
      />
    </div>
  );
}