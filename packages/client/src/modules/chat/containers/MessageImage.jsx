import React from 'react';
import { Constants, FileSystem, ImagePicker, Permissions } from 'expo';
import { ReactNativeFile } from 'apollo-upload-client';
import * as mime from 'react-native-mime-types';
import url from 'url';
import PropTypes from 'prop-types';
import { View, Platform } from 'react-native';

import chatConfig from '../../../../../../config/chat';
import ModalNotify from '../components/ModalNotify';

const {
  manifest: { bundleUrl }
} = Constants;
const { protocol, port, hostname } = url.parse(__API_URL__);
const serverUrl = `${protocol}//${hostname === 'localhost' ? url.parse(bundleUrl).hostname : hostname}${
  port ? ':' + port : ''
}`;

const imageDir = FileSystem.cacheDirectory + 'ImagePicker/';

const messageImage = Component => {
  return class MessageImage extends React.Component {
    static propTypes = {
      messages: PropTypes.object,
      t: PropTypes.func
    };

    state = {
      edges: [],
      endCursor: 0,
      images: chatConfig.images,
      notify: null
    };

    static getDerivedStateFromProps({ messages }, { images, edges: stateEdges, endCursor }) {
      if (images && messages) {
        const { edges } = messages;
        if (!stateEdges.length) {
          return { edges };
        }
        const addImageToNode = (node, { node: currentNode }) => {
          const quotedMessage = { ...node.quotedMessage, image: currentNode.quotedMessage.image };
          return { ...node, image: currentNode.image, quotedMessage };
        };

        return {
          endCursor: stateEdges.length > edges.length ? messages.pageInfo.endCursor : endCursor,
          edges: edges.map(({ node, cursor }) => {
            const currentEdge = stateEdges.find(({ node: { id } }) => node.id === id || !id);
            return currentEdge ? { node: addImageToNode(node, currentEdge), cursor } : { node, cursor };
          })
        };
      }
      return null;
    }

    componentDidMount() {
      this.checkImages();
    }

    componentDidUpdate() {
      this.checkImages();
    }

    checkImages = () => {
      const { edges, endCursor } = this.state;
      if (edges.length && (!endCursor || endCursor < this.props.messages.pageInfo.endCursor)) {
        const newEdges = edges.filter(
          ({ node: { path, image, quotedMessage } }) => (path && !image) || (quotedMessage.path && !quotedMessage.image)
        );
        if (newEdges.length) this.downloadImages(newEdges);
      }
    };

    downloadImages = async newMessages => {
      const { getInfoAsync, makeDirectoryAsync, readDirectoryAsync, downloadAsync } = FileSystem;
      const { isDirectory } = await getInfoAsync(imageDir);
      if (!isDirectory) await makeDirectoryAsync(imageDir);
      const files = await readDirectoryAsync(imageDir);
      newMessages.forEach(({ node }) => {
        Promise.all(
          [node, node.quotedMessage].map(({ filename, path }) => {
            if (filename && path && !files.includes(filename)) {
              return downloadAsync(serverUrl + '/' + path, imageDir + filename);
            }
          })
        ).then(() => this.addImagesToEdge(node.id));
      });
    };

    addImagesToEdge = async id => {
      const { edges } = this.state;
      this.setState({
        endCursor: this.props.messages.pageInfo.endCursor,
        edges: edges.map(({ node, cursor }) => {
          if (node.id === id) {
            const { quotedMessage: quoted, filename } = node;
            const quotedMessage = { ...quoted, image: quoted.filename ? `${imageDir}${quoted.filename}` : null };
            return { cursor, node: { ...node, quotedMessage, image: filename ? `${imageDir}${filename}` : null } };
          } else {
            return { node, cursor };
          }
        })
      });
    };

    checkPermission = async (type, skip) => {
      if (skip === Platform.OS) {
        return true;
      }
      const { getAsync, askAsync } = Permissions;
      const { status } = await getAsync(type);
      if (status !== 'granted') {
        const { status } = await askAsync(type);
        return status === 'granted';
      }
      return true;
    };

    pickImage = async ({ onSend }) => {
      const { t } = this.props;
      if (await this.checkPermission(Permissions.CAMERA_ROLL, 'android')) {
        const { cancelled, uri } = await ImagePicker.launchImageLibraryAsync(chatConfig.image.imagePicker);
        if (!cancelled) {
          const { size } = await FileSystem.getInfoAsync(uri);
          const reg = /[^\\/]*\.\w+$/;
          if (size <= chatConfig.image.maxSize && reg.test(uri)) {
            const type = mime.lookup(uri);
            const name = uri.match(reg)[0];
            const imageData = new ReactNativeFile({ uri, type, name });
            onSend({ attachment: imageData });
          } else {
            this.setState({ notify: t('attachment.errorMsg') });
          }
        }
      } else {
        this.setState({ notify: t('permission.errorMsg') });
      }
    };

    renderModal = () => {
      const { notify } = this.state;
      if (notify) {
        return <ModalNotify notify={notify} callback={() => this.setState({ notify: null })} />;
      }
    };

    render() {
      const { images, edges } = this.state;
      const { messages } = this.props;
      const newProps = {
        images,
        messages: edges.length ? { ...messages, edges } : messages,
        pickImage: this.pickImage
      };

      return (
        <View style={{ flex: 1 }}>
          <Component {...this.props} {...newProps} />
          {this.renderModal()}
        </View>
      );
    }
  };
};

export default messageImage;